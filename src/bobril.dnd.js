/// <reference path="bobril.d.ts"/>
/// <reference path="bobril.media.d.ts"/>
/// <reference path="bobril.mouse.d.ts"/>
/// <reference path="bobril.dnd.d.ts"/>
(function (b) {
    var lastDndId = 0;
    var dnds = [];
    var systemdnd = null;
    var rootId = null;
    var preventDefault = b.preventDefault;
    var DndCtx = function (pointerId) {
        this.id = ++lastDndId;
        this.pointerid = pointerId;
        this.enabledOperations = 7 /* MoveCopyLink */;
        this.operation = 0 /* None */;
        this.local = true;
        this.ended = false;
        this.targetCtx = null;
        this.dragView = null;
        this.startX = 0;
        this.startY = 0;
        this.x = 0;
        this.y = 0;
        this.deltaX = 0;
        this.deltaY = 0;
        this.shift = false;
        this.ctrl = false;
        this.alt = false;
        this.meta = false;
        this.data = Object.create(null);
        if (pointerId >= 0)
            pointer2Dnd[pointerId] = this;
        dnds.push(this);
        if (rootId == null) {
            rootId = b.addRoot(dndRootFactory);
        }
    };
    var DndComp = {
        render: function (ctx, me) {
            var dnd = ctx.data;
            me.tag = "div";
            me.style = { position: "absolute", left: dnd.x, top: dnd.y };
            me.children = dnd.dragView(dnd);
        }
    };
    var DndRootComp = {
        render: function (ctx, me) {
            var res = [];
            for (var i = 0; i < dnds.length; i++) {
                var dnd = dnds[i];
                if (dnd.dragView != null && (dnd.x != 0 || dnd.y != 0)) {
                    res.push({ key: "" + dnd.id, data: dnd, component: DndComp });
                }
            }
            me.tag = "div";
            me.style = { position: "fixed", userSelect: "none", pointerEvents: "none", left: 0, top: 0, right: 0, bottom: 0 };
            me.children = res;
        },
        onDrag: function (ctx) {
            b.invalidate(ctx);
            return false;
        }
    };
    function dndRootFactory() {
        return { component: DndRootComp };
    }
    var dndProto = DndCtx.prototype;
    dndProto.setOperation = function (operation) {
        this.operation = operation;
    };
    dndProto.setDragNodeView = function (view) {
        this.dragView = view;
    };
    dndProto.addData = function (type, data) {
        this.data[type] = data;
        return true;
    };
    dndProto.listData = function () {
        return Object.keys(this.data);
    };
    dndProto.hasData = function (type) {
        return this.data[type] !== undefined;
    };
    dndProto.getData = function (type) {
        return this.data[type];
    };
    dndProto.setEnabledOps = function (ops) {
        this.enabledOperations = ops;
    };
    dndProto.cancelDnd = function () {
        dndmoved(null, this);
        this.ended = true;
        b.broadcast("onDragEnd", this);
        this.destroy();
    };
    dndProto.destroy = function () {
        delete pointer2Dnd[this.pointerid];
        for (var i = 0; i < dnds.length; i++) {
            if (dnds[i] === this) {
                dnds.splice(i, 1);
                break;
            }
        }
        if (systemdnd === this) {
            systemdnd = null;
        }
        if (dnds.length === 0) {
            b.removeRoot(rootId);
            rootId = null;
        }
    };
    var pointer2Dnd = Object.create(null);
    function handlePointerDown(ev, target, node) {
        var dnd = pointer2Dnd[ev.id];
        if (dnd && dnd.totalX == null) {
            dnd.cancelDnd();
        }
        if (ev.button === 1) {
            pointer2Dnd[ev.id] = { lastX: ev.x, lastY: ev.y, totalX: 0, totalY: 0, startX: ev.x, startY: ev.y, sourceNode: node };
        }
        return false;
    }
    function dndmoved(node, dnd) {
        dnd.targetCtx = b.bubble(node, "onDragOver", dnd);
        if (dnd.targetCtx == null) {
            dnd.operation = 0 /* None */;
        }
        b.broadcast("onDrag", dnd);
    }
    function updateDndFromPointerEvent(dnd, ev) {
        dnd.shift = ev.shift;
        dnd.ctrl = ev.ctrl;
        dnd.alt = ev.alt;
        dnd.meta = ev.meta;
    }
    function handlePointerMove(ev, target, node) {
        var dnd = pointer2Dnd[ev.id];
        if (dnd && dnd.totalX == null) {
            dnd.x = ev.x;
            dnd.y = ev.y;
            updateDndFromPointerEvent(dnd, ev);
            dndmoved(node, dnd);
            return true;
        }
        else if (dnd && dnd.totalX != null) {
            dnd.totalX += Math.abs(ev.x - dnd.lastX);
            dnd.totalY += Math.abs(ev.y - dnd.lastY);
            dnd.lastX = ev.x;
            dnd.lastY = ev.y;
            if (dnd.totalX + dnd.totalY > 10) {
                node = dnd.sourceNode;
                var startX = dnd.startX;
                var startY = dnd.startY;
                dnd = new DndCtx(ev.id);
                dnd.startX = startX;
                dnd.startY = startY;
                dnd.x = ev.x;
                dnd.y = ev.y;
                updateDndFromPointerEvent(dnd, ev);
                var sourceCtx = b.bubble(node, "onDragStart", dnd);
                if (sourceCtx) {
                    var htmlNode = b.getDomNode(sourceCtx.me);
                    if (htmlNode == null) {
                        dnd.destroy();
                        return false;
                    }
                    var boundFn = htmlNode.getBoundingClientRect;
                    if (boundFn) {
                        var rect = boundFn.call(htmlNode);
                        dnd.deltaX = rect.left - startX;
                        dnd.deltaY = rect.top - startY;
                    }
                    dndmoved(node, dnd);
                    return true;
                }
                else {
                    dnd.destroy();
                }
            }
        }
        return false;
    }
    function handlePointerUp(ev, target, node) {
        var dnd = pointer2Dnd[ev.id];
        if (dnd && dnd.totalX == null) {
            dnd.x = ev.x;
            dnd.y = ev.y;
            updateDndFromPointerEvent(dnd, ev);
            dndmoved(node, dnd);
            var t = dnd.targetCtx;
            if (t && b.bubble(t.me, "onDrop", dnd)) {
                dnd.ended = true;
                b.broadcast("onDragEnd", dnd);
                dnd.destroy();
            }
            else {
                dnd.cancelDnd();
            }
            return true;
        }
        else if (dnd) {
            delete pointer2Dnd[ev.id];
        }
        return false;
    }
    function handlePointerCancel(ev, target, node) {
        var dnd = pointer2Dnd[ev.id];
        if (dnd && dnd.totalX == null) {
            dnd.cancelDnd();
        }
        else {
            delete pointer2Dnd[ev.id];
        }
        return false;
    }
    function updateFromNative(dnd, ev) {
        dnd.shift = ev.shiftKey;
        dnd.ctrl = ev.ctrlKey;
        dnd.alt = ev.altKey;
        dnd.meta = ev.metaKey;
        dnd.x = ev.clientX;
        dnd.y = ev.clientY;
        var node = b.nodeOnPoint(dnd.x, dnd.y); // Needed to correctly emulate pointerEvents:none
        dndmoved(node, dnd);
    }
    var effectAllowedTable = ["none", "link", "copy", "copyLink", "move", "linkMove", "copyMove", "all"];
    function handleDragStart(ev, target, node) {
        var dnd = systemdnd;
        if (dnd != null) {
            dnd.destroy();
        }
        var activePointerIds = Object.keys(pointer2Dnd);
        var startX = ev.clientX, startY = ev.clientY, poid = -1;
        for (var i = 0; i < activePointerIds.length; i++) {
            dnd = pointer2Dnd[activePointerIds[i]];
            if (dnd.totalX != null) {
                poid = +activePointerIds[i];
                startX = dnd.startX;
                startY = dnd.startY;
                delete pointer2Dnd[poid];
                break;
            }
        }
        dnd = new DndCtx(poid);
        systemdnd = dnd;
        dnd.x = ev.clientX;
        dnd.y = ev.clientY;
        dnd.startX = startX;
        dnd.startY = startY;
        var sourceCtx = b.bubble(node, "onDragStart", dnd);
        if (sourceCtx) {
            var htmlNode = b.getDomNode(sourceCtx.me);
            if (htmlNode == null) {
                dnd.destroy();
                return false;
            }
            var boundFn = htmlNode.getBoundingClientRect;
            if (boundFn) {
                var rect = boundFn.call(htmlNode);
                dnd.deltaX = rect.left - startX;
                dnd.deltaY = rect.top - startY;
            }
            var eff = effectAllowedTable[dnd.enabledOperations];
            var dt = ev.dataTransfer;
            dt.effectAllowed = eff;
            if (dt.setDragImage) {
                var div = document.createElement("div");
                div.style.pointerEvents = "none";
                dt.setDragImage(div, 0, 0);
            }
            else {
                // For IE10 and IE11 hack to hide default drag element
                var style = htmlNode.style;
                var opacityBackup = style.opacity;
                var widthBackup = style.width;
                var heightBackup = style.height;
                var paddingBackup = style.padding;
                style.opacity = "0";
                style.width = "0";
                style.height = "0";
                style.padding = "0";
                window.setTimeout(function () {
                    style.opacity = opacityBackup;
                    style.width = widthBackup;
                    style.height = heightBackup;
                    style.padding = paddingBackup;
                }, 0);
            }
            var datas = dnd.data;
            var dataKeys = Object.keys(datas);
            for (var i = 0; i < dataKeys.length; i++) {
                try {
                    var k = dataKeys[i];
                    var d = datas[k];
                    if (typeof d !== "string")
                        d = JSON.stringify(d);
                    ev.dataTransfer.setData(k, d);
                }
                catch (e) {
                    if (DEBUG)
                        if (window.console)
                            console.log("Cannot set dnd data to " + dataKeys[i]);
                }
            }
            updateFromNative(dnd, ev);
        }
        else {
            dnd.destroy();
        }
        return false;
    }
    function setDropEffect(ev, op) {
        ev.dataTransfer.dropEffect = ["none", "link", "copy", "move"][op];
    }
    function handleDragOver(ev, target, node) {
        var dnd = systemdnd;
        if (dnd == null) {
            dnd = new DndCtx(-1);
            systemdnd = dnd;
            dnd.x = ev.clientX;
            dnd.y = ev.clientY;
            dnd.startX = dnd.x;
            dnd.startY = dnd.y;
            dnd.local = false;
            var dt = ev.dataTransfer;
            var eff = 0;
            try {
                var effectAllowed = dt.effectAllowed;
            }
            catch (e) { }
            for (; eff < 7; eff++) {
                if (effectAllowedTable[eff] === effectAllowed)
                    break;
            }
            dnd.enabledOperations = eff;
            var dttypes = dt.types;
            if (dttypes) {
                for (var i = 0; i < dttypes.length; i++) {
                    var tt = dttypes[i];
                    if (tt === "text/plain")
                        tt = "Text";
                    else if (tt === "text/uri-list")
                        tt = "Url";
                    dnd.data[tt] = null;
                }
            }
            else {
                if (dt.getData("Text") !== undefined)
                    dnd.data["Text"] = null;
            }
        }
        updateFromNative(dnd, ev);
        setDropEffect(ev, dnd.operation);
        if (dnd.operation != 0 /* None */) {
            preventDefault(ev);
            return true;
        }
        return false;
    }
    function handleDrag(ev, target, node) {
        var x = ev.clientX;
        var y = ev.clientY;
        var m = b.getMedia();
        if (systemdnd != null && (x === 0 && y === 0 || x < 0 || y < 0 || x >= m.width || y >= m.height)) {
            systemdnd.x = 0;
            systemdnd.y = 0;
            systemdnd.operation = 0 /* None */;
            b.broadcast("onDrag", systemdnd);
        }
        return false;
    }
    function handleDragEnd(ev, target, node) {
        if (systemdnd != null) {
            systemdnd.ended = true;
            b.broadcast("onDragEnd", systemdnd);
            systemdnd.cancelDnd();
        }
        return false;
    }
    function handleDrop(ev, target, node) {
        var dnd = systemdnd;
        if (dnd == null)
            return false;
        dnd.x = ev.clientX;
        dnd.y = ev.clientY;
        if (!dnd.local) {
            var dataKeys = Object.keys(dnd.data);
            var dt = ev.dataTransfer;
            for (var i = 0; i < dataKeys.length; i++) {
                var k = dataKeys[i];
                var d;
                if (k === "Files") {
                    d = [].slice.call(dt.files, 0); // What a useless FileList type! Get rid of it.
                }
                else {
                    d = dt.getData(k);
                    if (typeof d !== "string") {
                        d = JSON.parse(d);
                    }
                }
                dnd.data[k] = d;
            }
        }
        updateFromNative(dnd, ev);
        var t = dnd.targetCtx;
        if (t && b.bubble(t.me, "onDrop", dnd)) {
            setDropEffect(ev, dnd.operation);
            dnd.ended = true;
            b.broadcast("onDragEnd", dnd);
            dnd.destroy();
            preventDefault(ev);
        }
        else {
            dnd.cancelDnd();
        }
        return true;
    }
    function justPreventDefault(ev, target, node) {
        preventDefault(ev);
        return true;
    }
    var addEvent = b.addEvent;
    addEvent("!PointerDown", 4, handlePointerDown);
    addEvent("!PointerMove", 4, handlePointerMove);
    addEvent("!PointerUp", 4, handlePointerUp);
    addEvent("!PointerCancel", 4, handlePointerCancel);
    addEvent("dragstart", 5, handleDragStart);
    addEvent("dragover", 5, handleDragOver);
    addEvent("dragend", 5, handleDragEnd);
    addEvent("drag", 5, handleDrag);
    addEvent("drop", 5, handleDrop);
    addEvent("dragenter", 5, justPreventDefault);
    addEvent("dragleave", 5, justPreventDefault);
    b.getDnds = function () { return dnds; };
})(b);
