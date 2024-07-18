const settings = {
    fontSize: 30,
    minFontSize: 10,
    speed: 10,
    flip: 1,
    editMode: false,
    lorem: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
};
const root = document.querySelector(":root");
const p = document.querySelector("p");
const actions = new Map();

actions.set(["-"], () => {
    settings.fontSize = Math.max(settings.fontSize - 1, settings.minFontSize);
    setStyle("--fontSize", `${settings.fontSize}px`);
    goToTop();
});
actions.set(["_"], () => {
    settings.fontSize = Math.max(settings.fontSize - 5, settings.minFontSize);
    setStyle("--fontSize", `${settings.fontSize}px`);
    goToTop();
});
actions.set(["="], () => {
    settings.fontSize++;
    setStyle("--fontSize", `${settings.fontSize}px`);
    goToTop();
});
actions.set(["+"], () => {
    settings.fontSize += 5;
    setStyle("--fontSize", `${settings.fontSize}px`);
    goToTop();
});
actions.set(["[", "{"], () => {
    settings.flip = 1;
    setStyle("--flip", settings.flip);
    goToTop();
});
actions.set(["]", "}"], () => {
    settings.flip = -1;
    setStyle("--flip", settings.flip);
    goToTop();
});
actions.set(["ArrowDown", "ArrowRight"], () => {
    if (p.scrollHeight > window.innerHeight) {
        const top = Number(p.style.top.slice(0, -2)) - settings.speed;
        p.style.top = `${top}px`;
    }
});
actions.set(["ArrowUp", "ArrowLeft"], () => {
    if (p.scrollHeight > window.innerHeight) {
        const top = Number(p.style.top.slice(0, -2)) + settings.speed;
        p.style.top = `${top}px`;
    }
});
actions.set(["/", "?"], goToTop);
actions.set(["Enter"], toggleFullScreen);

function getStyle(name) {
    return getComputedStyle(root).getPropertyValue(name);
}
function setStyle(name, value) {
    return root.style.setProperty(name, value);
}

function goToTop() {
    if (settings.flip === 1) p.style.top = 0;
    else {
        const pos = p.scrollHeight - window.innerHeight;
        p.style.top = `${-pos}px`;
    }
}

window.addEventListener("keydown", ({ key }) => {
    if (settings.editMode) return;
    for (let keys of [...actions.keys()]) {
        if (keys.includes(key)) {
            return actions.get(keys)();
        }
    }
});
p.addEventListener("focus", () => (settings.editMode = true));
p.addEventListener("blur", () => {
    settings.editMode = false;
    const text = p.innerHTML
        .replaceAll("&nbsp;", "")
        .replaceAll("<div><br></div>", "<br><br>")
        .replaceAll("<div>", "")
        .replaceAll("</div>", "")
        .trim();
    localStorage.setItem("text", text);
    if (!text) p.textContent = settings.lorem;
});

startup: {
    const text = localStorage.getItem("text");
    if (text) p.innerHTML = text;
    else p.innerHTML = settings.lorem;
    goToTop();
}

function toggleFullScreen() {
    var doc = window.document;
    var docEl = doc.documentElement;

    var requestFullScreen =
        docEl.requestFullscreen ||
        docEl.mozRequestFullScreen ||
        docEl.webkitRequestFullScreen ||
        docEl.msRequestFullscreen;
    var cancelFullScreen =
        doc.exitFullscreen ||
        doc.mozCancelFullScreen ||
        doc.webkitExitFullscreen ||
        doc.msExitFullscreen;

    if (
        !doc.fullscreenElement &&
        !doc.mozFullScreenElement &&
        !doc.webkitFullscreenElement &&
        !doc.msFullscreenElement
    ) {
        requestFullScreen.call(docEl);
    } else {
        cancelFullScreen.call(doc);
    }
}
