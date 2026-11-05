// Teleprompter. Plain JS, no build step.
//
// Keys (every other key is ignored):
//   ArrowDown / ArrowRight   forward one line; hold to scroll smoothly
//   ArrowUp / ArrowLeft      back one line; hold to scroll smoothly
//   ;  /  '                  slower / faster hold scroll
//   -  /  =                  smaller / bigger text (Shift for steps of 5)
//   [  /  ]                  mirror / un-mirror ("[" = mirrored, the recording default)
//   .                        dark mode on/off
//   /                        jump to top
//   Enter                    fullscreen on/off
//   L                        script list (arrows choose, Enter loads, L closes)

const REPO = "ianJStutor/teleprompter-scripts";
const API = `https://api.github.com/repos/${REPO}`;

const MIN_FONT = 10;
const MIN_SPEED = 0.25; // lines per second
const SPEED_STEP = 0.25;
const HOLD_DELAY = 250; // ms a key must be held before smooth scroll starts

const PLACEHOLDER = "No script loaded yet.";

const settings = {
    fontSize: 80,
    speed: 2, // hold-scroll speed in lines per second
    flip: -1, // -1 = mirrored, 1 = normal
};

const root = document.documentElement;
const text = document.getElementById("script");
const indicator = document.getElementById("indicator");
const filesBox = document.getElementById("files");
const filesList = filesBox.querySelector("ul");
const tokenForm = document.getElementById("token-form");
const tokenInput = document.getElementById("token");
const tokenMessage = document.getElementById("token-message");

let offset = 0; // vertical position of the script, in px (0 or negative)
let hold = null; // { dir, timer, frame, last } while an arrow key is down
let files = []; // [{ name, path, date }] from the last list fetch
let selected = 0;

// ---------- localStorage (can throw in private mode etc.) ----------

function load(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}
function save(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // not fatal; the setting just won't be remembered
    }
}

// ---------- display ----------

function lineHeight() {
    return parseFloat(getComputedStyle(text).lineHeight) || settings.fontSize * 1.3;
}

function clampOffset() {
    const min = Math.min(0, -(text.offsetHeight - 2 * lineHeight()));
    offset = Math.max(min, Math.min(0, offset));
}

function render() {
    clampOffset();
    text.style.transform = `translate3d(0, ${offset}px, 0) scaleX(${settings.flip})`;
}

let indicatorTimer;
function notify(message) {
    indicator.textContent = message;
    indicator.classList.add("show");
    clearTimeout(indicatorTimer);
    indicatorTimer = setTimeout(() => indicator.classList.remove("show"), 2000);
}

function setFontSize(size) {
    const old = settings.fontSize;
    settings.fontSize = Math.max(MIN_FONT, size);
    root.style.setProperty("--fontSize", `${settings.fontSize}px`);
    offset *= settings.fontSize / old; // stay near the same place in the text
    render();
    save("tp.fontSize", settings.fontSize);
    notify(`Font ${settings.fontSize}px`);
}

function setSpeed(speed) {
    settings.speed = Math.max(MIN_SPEED, Math.round(speed / SPEED_STEP) * SPEED_STEP);
    save("tp.speed", settings.speed);
    notify(`Speed ${settings.speed} lines/s`);
}

function setFlip(flip) {
    settings.flip = flip;
    root.style.setProperty("--flip", flip);
    render();
}

function showScript(content) {
    text.textContent = content;
    offset = 0;
    render();
}

// ---------- scrolling ----------

function step(dir) {
    offset -= dir * lineHeight();
    render();
}

function startHold(dir) {
    stopHold();
    step(dir); // a tap is exactly one line
    hold = { dir, frame: 0, last: 0 };
    hold.timer = setTimeout(() => {
        text.classList.add("holding");
        hold.last = performance.now();
        hold.frame = requestAnimationFrame(holdFrame);
    }, HOLD_DELAY);
}

// Distance is based on elapsed time, so a slow or dropped frame doesn't change the speed.
function advanceHold() {
    const now = performance.now();
    offset -= hold.dir * settings.speed * lineHeight() * ((now - hold.last) / 1000);
    hold.last = now;
    render();
}

function holdFrame() {
    if (!hold) return;
    advanceHold();
    hold.frame = requestAnimationFrame(holdFrame);
}

function stopHold() {
    if (!hold) return;
    clearTimeout(hold.timer);
    cancelAnimationFrame(hold.frame);
    if (hold.last) advanceHold(); // count the time since the last frame
    hold = null;
    text.classList.remove("holding");
}

// ---------- fullscreen ----------

function toggleFullScreen() {
    const doc = document;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
    } else {
        const el = doc.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
}

// ---------- GitHub ----------

class AuthError extends Error {}

async function github(path, accept = "application/vnd.github+json") {
    const token = load("tp.token");
    const response = await fetch(API + path, {
        headers: { Accept: accept, Authorization: `Bearer ${token}` },
        cache: "no-store",
    });
    if (response.status === 401 || response.status === 404) {
        // 404 is what GitHub returns when the token can't see the private repo
        throw new AuthError(String(response.status));
    }
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    return accept.includes("raw") ? response.text() : response.json();
}

async function listScripts() {
    const entries = await github("/contents/");
    const scripts = entries.filter(
        (e) => e.type === "file" && /\.(txt|md)$/i.test(e.name) && e.name.toLowerCase() !== "readme.md"
    );
    const dated = await Promise.all(
        scripts.map(async (e) => {
            const commits = await github(`/commits?path=${encodeURIComponent(e.path)}&per_page=1`);
            const date = commits[0]?.commit?.committer?.date || "";
            return { name: e.name, path: e.path, date };
        })
    );
    return dated.sort((a, b) => b.date.localeCompare(a.date));
}

async function openScript(file) {
    const encoded = file.path.split("/").map(encodeURIComponent).join("/");
    const content = await github(`/contents/${encoded}`, "application/vnd.github.raw+json");
    showScript(content);
    save("tp.script", JSON.stringify({ name: file.name, date: file.date, content }));
    notify(file.name);
}

function cachedScript() {
    try {
        return JSON.parse(load("tp.script"));
    } catch {
        return null;
    }
}

function handleError(error) {
    if (error instanceof AuthError) {
        askForToken("GitHub didn't accept the saved token (expired, or no access to teleprompter-scripts). Paste a new one.");
    } else {
        notify("Can't reach GitHub; showing the cached script");
    }
}

async function loadNewest() {
    try {
        files = await listScripts();
        if (!files.length) {
            if (!cachedScript()) showScript("No .txt or .md scripts in teleprompter-scripts yet.");
            return;
        }
        const newest = files[0];
        const cached = cachedScript();
        if (cached && cached.name === newest.name && cached.date === newest.date) return;
        await openScript(newest);
    } catch (error) {
        handleError(error);
    }
}

// ---------- file list (L) ----------

function renderFiles() {
    filesList.replaceChildren(
        ...files.map((file, i) => {
            const li = document.createElement("li");
            li.textContent = file.name;
            const time = document.createElement("time");
            time.textContent = file.date ? new Date(file.date).toLocaleString() : "";
            li.append(time);
            li.classList.toggle("selected", i === selected);
            li.addEventListener("click", () => chooseFile(i));
            return li;
        })
    );
    filesList.children[selected]?.scrollIntoView({ block: "nearest" });
}

async function openFiles() {
    if (!load("tp.token")) {
        askForToken();
        return;
    }
    filesBox.hidden = false;
    filesList.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Loading…" }));
    try {
        files = await listScripts();
        selected = 0;
        if (files.length) renderFiles();
        else filesList.firstChild.textContent = "No scripts yet.";
    } catch (error) {
        filesBox.hidden = true;
        handleError(error);
    }
}

async function chooseFile(i) {
    filesBox.hidden = true;
    try {
        await openScript(files[i]);
    } catch (error) {
        handleError(error);
    }
}

function filesKey(key) {
    if (key === "ArrowDown" || key === "ArrowRight") selected = Math.min(files.length - 1, selected + 1);
    else if (key === "ArrowUp" || key === "ArrowLeft") selected = Math.max(0, selected - 1);
    else if (key === "Enter" && files.length) return chooseFile(selected);
    else if (key === "l" || key === "L" || key === "Escape") filesBox.hidden = true;
    renderFiles();
}

// ---------- token box ----------

function askForToken(message = "") {
    tokenMessage.textContent = message;
    tokenInput.value = "";
    tokenForm.hidden = false;
    tokenInput.focus();
}

tokenForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const token = tokenInput.value.trim();
    tokenInput.value = "";
    if (!token) return;
    save("tp.token", token);
    tokenForm.hidden = true;
    tokenInput.blur();
    loadNewest();
});

document.getElementById("token-skip").addEventListener("click", () => {
    tokenInput.value = "";
    tokenForm.hidden = true;
    tokenInput.blur();
});

// ---------- keys ----------

const actions = new Map([
    ["ArrowDown", () => startHold(1)],
    ["ArrowRight", () => startHold(1)],
    ["ArrowUp", () => startHold(-1)],
    ["ArrowLeft", () => startHold(-1)],
    [";", () => setSpeed(settings.speed - SPEED_STEP)],
    ["'", () => setSpeed(settings.speed + SPEED_STEP)],
    ["-", () => setFontSize(settings.fontSize - 1)],
    ["_", () => setFontSize(settings.fontSize - 5)],
    ["=", () => setFontSize(settings.fontSize + 1)],
    ["+", () => setFontSize(settings.fontSize + 5)],
    ["[", () => setFlip(-1)], // mirror
    ["{", () => setFlip(-1)],
    ["]", () => setFlip(1)], // un-mirror
    ["}", () => setFlip(1)],
    [".", () => root.classList.toggle("dark")],
    [">", () => root.classList.toggle("dark")],
    ["/", () => { offset = 0; render(); }],
    ["?", () => { offset = 0; render(); }],
    ["Enter", toggleFullScreen],
    ["l", openFiles],
    ["L", openFiles],
]);

window.addEventListener("keydown", (event) => {
    // The token box is the only place typing is allowed.
    if (event.target === tokenInput) return;
    event.preventDefault(); // swallow everything else, including the ContextMenu key
    if (event.repeat) return; // holds are timed by keydown/keyup, not auto-repeat
    if (!filesBox.hidden) return filesKey(event.key);
    actions.get(event.key)?.();
});

window.addEventListener("keyup", (event) => {
    if (event.target === tokenInput) return;
    event.preventDefault();
    if (hold && event.key.startsWith("Arrow")) stopHold();
});

window.addEventListener("blur", stopHold);
window.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("resize", render);

// ---------- startup ----------

{
    const font = Number(load("tp.fontSize"));
    if (font >= MIN_FONT) settings.fontSize = font;
    const speed = Number(load("tp.speed"));
    if (speed >= MIN_SPEED) settings.speed = speed;
    root.style.setProperty("--fontSize", `${settings.fontSize}px`);
    setFlip(settings.flip);

    const cached = cachedScript();
    showScript(cached?.content || PLACEHOLDER);

    if (load("tp.token")) loadNewest();
    else askForToken();
}
