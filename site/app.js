/* Router for the two question-driven pages. The Older section is a separate frozen page under older/. */
(() => {
  "use strict";
  const { $, purge, initTheme, csv } = FX;
  const view = $("#view");
  const PAGES = { landfire: window.PageLandfire, fems: window.PageStations };
  let INDEX = null, rendering = 0;
  async function route() {
    const tab = PAGES[location.hash.slice(1)] ? location.hash.slice(1) : "landfire";
    document.querySelectorAll(".supertabs a").forEach(a => a.classList.toggle("active", a.dataset.tab === tab));
    const id = ++rendering;
    purge();
    view.innerHTML = "";
    view.hidden = false;
    window.scrollTo({ top: 0 });
    await PAGES[tab](view, INDEX, () => id === rendering);
  }
  async function init() {
    initTheme(route);
    try {
      INDEX = await (await fetch(FX.DATA + "index.json")).json();
    } catch (e) {
      $("#loading").innerHTML = `<p class="muted">Could not load data/index.json (${FX.esc(e.message)}). Run build_site.py first.</p>`;
      return;
    }
    $("#built-from").textContent = `California · LANDFIRE × FEMS · built ${INDEX.built}`;
    $("#loading").remove();
    window.addEventListener("hashchange", route);
    route();
  }
  init();
})();
