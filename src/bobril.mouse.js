/// <reference path="../src/bobril.d.ts"/>
/// <reference path="../src/bobril.mouse.d.ts"/>
/// <reference path="../src/lib.touch.d.ts"/>
var Coord = (function () {
    function Coord(x, y) {
        this.x = x;
        this.y = y;
    }
    Coord.prototype.hit = function (x, y) {
        return Math.abs(this.x - x) < Coord.CLICKBUSTER_THRESHOLD && Math.abs(this.y - y) < Coord.CLICKBUSTER_THRESHOLD;
    };
    Coord.CLICKBUSTER_THRESHOLD = 50; // 25 pixels in any dimension is the limit for busting clicks.
    return Coord;
})();
var CoordList = (function () {
    function CoordList() {
        this.coords = [];
    }
    CoordList.prototype.containsTouchedRegion = function (x, y, removeIfHit) {
        for (var i = 0; i < this.coords.length; i += 1) {
            if (this.coords[i].hit(x, y)) {
                if (removeIfHit) {
                    this.coords.splice(i, 1);
                }
                return true; // allowable region
            }
        }
        return false; // No allowable region; bust it.
    };
    CoordList.prototype.push = function (x, y) {
        this.coords.push(new Coord(x, y));
    };
    CoordList.prototype.remove = function (x, y) {
        for (var i = 0; i < this.coords.length; i += 1) {
            if (this.coords[i].x == x && this.coords[i].y == y) {
                this.coords.splice(i, 1);
                return;
            }
        }
    };
    return CoordList;
})();
(function (b) {
    var preventDefault = b.preventDefault;
    var now = b.now;
    var PREVENT_DURATION = 2500; // 2.5 seconds maximum from preventGhostClick call to click
    function getCoordinates(event) {
        var touches = event.touches && event.touches.length ? event.touches : [event];
        var e = (event.changedTouches && event.changedTouches[0]) || (event.originalEvent && event.originalEvent.changedTouches && event.originalEvent.changedTouches[0]) || touches[0].originalEvent || touches[0];
        return {
            x: e.clientX,
            y: e.clientY
        };
    }
    var lastPreventedTime = 0;
    var touchCoordinates = new CoordList();
    var lastLabelClickCoordinates;
    function buster(event, target, node) {
        if (now() - lastPreventedTime > PREVENT_DURATION) {
            return false; // Too old.
        }
        var touches = event.touches && event.touches.length ? event.touches : [event];
        var x = touches[0].clientX;
        var y = touches[0].clientY;
        // Work around desktop Webkit quirk where clicking a label will fire two clicks (on the label
        // and on the input element). Depending on the exact browser, this second click we don't want
        // to bust has either (0,0), negative coordinates, or coordinates equal to triggering label
        // click event
        if (x < 1 && y < 1) {
            return false; // offscreen
        }
        if (lastLabelClickCoordinates && lastLabelClickCoordinates[0] === x && lastLabelClickCoordinates[1] === y) {
            return false; // input click triggered by label click
        }
        // reset label click coordinates on first subsequent click
        if (lastLabelClickCoordinates) {
            lastLabelClickCoordinates = null;
        }
        // remember label click coordinates to prevent click busting of trigger click event on input
        if (event.target.tagName.toLowerCase() === "label") {
            lastLabelClickCoordinates = [x, y];
        }
        if (!touchCoordinates.containsTouchedRegion(x, y, event.type == "click")) {
            return false;
        }
        // If we didn't find an allowable region, bust the click.
        preventDefault(event);
        // Blur focused form elements
        event.target && event.target.blur();
        return true;
    }
    // Global touchstart handler that creates an allowable region for a click event.
    // This allowable region can be removed by preventGhostClick if we want to bust it.
    function collectCoordinates(ev, target, node) {
        var touches = ev.touches && ev.touches.length ? ev.touches : [ev];
        var x = touches[0].clientX;
        var y = touches[0].clientY;
        touchCoordinates.push(x, y);
        setTimeout(function () {
            // Remove the allowable region.
            touchCoordinates.remove(x, y);
        }, PREVENT_DURATION);
        return false;
    }
    var tapping = false;
    var tapElement;
    var startTime;
    var touchStartX;
    var touchStartY;
    function handleTouchStart(ev, target, node) {
        tapping = true;
        tapElement = target;
        // Hack for Safari, which can target text nodes instead of containers.
        if (tapElement.nodeType == 3) {
            tapElement = tapElement.parentNode;
        }
        startTime = now();
        var touches = ev.touches && ev.touches.length ? ev.touches : [ev];
        var e = touches[0].originalEvent || touches[0];
        touchStartX = e.clientX;
        touchStartY = e.clientY;
        return false;
    }
    var TAP_DURATION = 750; // Shorter than 750ms is a tap, longer is a taphold or drag.
    var MOVE_TOLERANCE = 12; // 12px seems to work in most mobile browsers.
    function handleTouchEnd(ev, target, node) {
        var diff = now() - startTime;
        var touches = (ev.changedTouches && ev.changedTouches.length) ? ev.changedTouches : ((ev.touches && ev.touches.length) ? ev.touches : [ev]);
        var e = touches[0].originalEvent || touches[0];
        var x = e.clientX;
        var y = e.clientY;
        var dist = Math.sqrt(Math.pow(x - touchStartX, 2) + Math.pow(y - touchStartY, 2));
        var stop = false;
        if (tapping && diff < TAP_DURATION && dist < MOVE_TOLERANCE) {
            lastPreventedTime = now();
            // Blur the focused element (the button, probably) before firing the callback.
            // This doesn't work perfectly on Android Chrome, but seems to work elsewhere.
            // I couldn't get anything to work reliably on Android Chrome.
            if (tapElement) {
                tapElement.blur();
            }
            var disabled = node.attrs && node.attrs["disabled"];
            if (typeof disabled === "undefined" || disabled === false) {
                stop = emitClickEvent(ev, target, node, x, y);
            }
        }
        resetState();
        return stop;
    }
    function emitClickEvent(ev, target, node, x, y) {
        if (!node)
            return false;
        if (b.bubble(node, "onClick", { x: x, y: y })) {
            preventDefault(ev);
            return true;
        }
        return false;
    }
    function resetState() {
        tapping = false;
    }
    function tapCanceled(ev, target, node) {
        resetState();
        return false;
    }
    function buildParam(event) {
        var coords = getCoordinates(event);
        return {
            x: coords.x,
            y: coords.y
        };
    }
    function createHandler(handlerName) {
        return function (ev, target, node) {
            if (!node)
                return false;
            var param = buildParam(ev);
            if (b.bubble(node, handlerName, param)) {
                preventDefault(ev);
                return true;
            }
            return false;
        };
    }
    function isValidMouseLeave(ev) {
        var from = ev.fromElement;
        var to = ev.toElement;
        while (to) {
            to = to.parentElement;
            if (to == from) {
                return false;
            }
        }
        return true;
    }
    function createNoBubblingHandler(handlerName, validator) {
        return function (ev, target, node) {
            if (!node)
                return false;
            var param = buildParam(ev);
            var c = node.component;
            if (c) {
                if (validator && !validator(ev))
                    return false;
                var m = c[handlerName];
                if (m) {
                    m.call(c, node.ctx, param);
                }
            }
            return false;
        };
    }
    function hasPointerEventsNone(target) {
        var bNode = b.deref(target);
        return bNode && bNode.attrs && bNode.attrs.style && bNode.attrs.style.pointerEvents && bNode.attrs.style.pointerEvents == "none";
    }
    function pointerThroughIE(ev, target, node) {
        var hiddenEls = [];
        var t = target;
        while (hasPointerEventsNone(t)) {
            hiddenEls.push({ target: t, prevDisplay: t.style.display });
            t.style.display = "none";
            t = document.elementFromPoint(ev.x, ev.y);
        }
        if (hiddenEls.length) {
            for (var i = hiddenEls.length - 1; i >= 0; --i) {
                hiddenEls[i].target.style.display = hiddenEls[i].prevDisplay;
            }
            if (b.ieVersion() < 9)
                t.fireEvent("on" + ev.type, ev);
            else
                t.dispatchEvent(ev);
            preventDefault(ev);
            return true;
        }
        return false;
    }
    var addEvent = b.addEvent;
    if (b.ieVersion() && b.ieVersion() < 11) {
        // emulate pointer-events: none in older ie
        var mouseEvents = [
            "click",
            "dblclick",
            "drag",
            "dragend",
            "dragenter",
            "dragleave",
            "dragover",
            "dragstart",
            "drop",
            "mousedown",
            "mousemove",
            "mouseout",
            "mouseover",
            "mouseup",
            "mousewheel",
            "scroll",
            "wheel"
        ];
        for (var i = 0; i < mouseEvents.length; ++i) {
            addEvent(mouseEvents[i], 1, pointerThroughIE);
        }
    }
    addEvent("mousedown", 2, buster);
    addEvent("mouseup", 2, buster);
    addEvent("click", 2, buster);
    addEvent("touchstart", 3, collectCoordinates);
    addEvent("mouseover", 300, createNoBubblingHandler("onMouseEnter")); // bubbling mouseover and out are same basically same as nonbubling mouseenter and leave
    addEvent("mouseout", 300, createNoBubblingHandler("onMouseLeave", isValidMouseLeave));
    addEvent("click", 400, createHandler("onClick"));
    addEvent("dblclick", 400, createHandler("onDoubleClick"));
    addEvent("mousedown", 400, createHandler("onMouseDown"));
    addEvent("touchstart", 400, createHandler("onMouseDown"));
    addEvent("mouseup", 400, createHandler("onMouseUp"));
    addEvent("touchend", 400, createHandler("onMouseUp"));
    addEvent("mousemove", 400, createHandler("onMouseMove"));
    addEvent("mouseover", 400, createHandler("onMouseOver"));
    addEvent("touchstart", 500, handleTouchStart);
    addEvent("touchcancel", 500, tapCanceled);
    addEvent("touchend", 500, handleTouchEnd);
    addEvent("touchmove", 500, tapCanceled);
})(b);
//# sourceMappingURL=bobril.mouse.js.map