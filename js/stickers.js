(() => {
  "use strict";

  const STORE = "stickers";
  const CANVAS_W = 270;
  const CANVAS_H = 480;
  let panelReady = false;
  let selectedId = null;
  let activePage = 1;
  let dragSession = null;

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() :
      "sticker-" + Date.now() + "-" + Math.random().toString(36).slice(2));

  function getDB() {
    return openDB();
  }

  async function saveSticker(item) {
    const database = await getDB();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("贴纸保存失败"));
    });
  }

  async function removeStickerFromDB(id) {
    const database = await getDB();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("贴纸删除失败"));
    });
  }

  async function restoreStickers() {
    const database = await openDB();

    const items = await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    state.stickers = items;
    createPanel();
    refreshLayerList();
  }

  function getSticker(id) {
    return state.stickers.find(item => item.id === id);
  }

  function getPage() {
    const input = document.querySelector("#sticker-page");
    const value = Number(input?.value || activePage);
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
  }

  function syncStickerDOM(item) {
    document.querySelectorAll(".sticker-item").forEach(node => {
      if (node.dataset.stickerId !== item.id) return;
      node.style.left = item.x + "px";
      node.style.top = item.y + "px";
      node.style.width = item.width + "px";
      node.style.height = item.height + "px";
      node.style.transform = `rotate(${item.rotation || 0}deg)`;
      node.style.zIndex = String(Number.isFinite(Number(item.zIndex)) ? Number(item.zIndex) : 1);
      node.style.display = item.visible === false ? "none" : "";
      node.classList.toggle("is-selected", item.id === selectedId);
      node.classList.toggle("is-locked", !!item.locked);
    });
  }

  function selectSticker(id) {
    selectedId = id;
    const item = getSticker(id);
    if (item) activePage = item.page;
    document.querySelectorAll(".sticker-item").forEach(node => {
      node.classList.toggle("is-selected", node.dataset.stickerId === id);
    });
    refreshLayerList();
  }

  function renderStickersForCanvas(canvasWrap, pageNum) {
    if (!canvasWrap) return;

    const oldLayer = canvasWrap.querySelector(".sticker-layer");
    if (oldLayer) oldLayer.remove();

    const layer = document.createElement("div");
    layer.className = "sticker-layer";
    layer.dataset.page = String(pageNum);
    canvasWrap.appendChild(layer);

    (state.stickers || [])
      .filter(item => item.page === pageNum)
      .forEach(item => {
        const node = document.createElement("div");
        node.className = "sticker-item";
        node.dataset.stickerId = item.id;
        node.style.left = (item.x || 0) + "px";
        node.style.top = (item.y || 0) + "px";
        node.style.width = (item.width || 100) + "px";
        node.style.height = (item.height || 100) + "px";
        node.style.transform = `rotate(${item.rotation || 0}deg)`;
        node.style.zIndex = String(Number.isFinite(Number(item.zIndex)) ? Number(item.zIndex) : 1);
        node.style.display = item.visible === false ? "none" : "";
        node.classList.toggle("is-selected", item.id === selectedId);
        node.classList.toggle("is-locked", !!item.locked);

        const img = document.createElement("img");
        img.src = item.src;
        img.alt = item.name || "贴纸";
        img.draggable = false;
        node.appendChild(img);

        const name = document.createElement("span");
        name.className = "sticker-name";
        name.textContent = item.name || "贴纸";
        node.appendChild(name);

        if (!item.locked) {
          const resize = document.createElement("button");
          resize.type = "button";
          resize.className = "sticker-handle sticker-resize";
          resize.title = "拖动缩放";
          resize.textContent = "↘";
          node.appendChild(resize);

          const rotate = document.createElement("button");
          rotate.type = "button";
          rotate.className = "sticker-handle sticker-rotate";
          rotate.title = "拖动旋转";
          rotate.textContent = "↻";
          node.appendChild(rotate);
        }

        layer.appendChild(node);
      });
  }

  function renderEverywhere() {
    document.querySelectorAll(".canvas-wrap").forEach(canvas => {
      renderStickersForCanvas(
        canvas,
        Number(canvas.querySelector(".sticker-layer")?.dataset.page ||
          findPageForCanvas(canvas))
      );
    });
    refreshLayerList();
  }

  function findPageForCanvas(canvas) {
    const match = canvas.id.match(/-p(\d+)$/);
    return match ? Number(match[1]) : 1;
  }

  function refreshLayerList() {
    const list = document.querySelector("#sticker-layer-list");
    if (!list) return;

    list.replaceChildren();
    const pageInput = document.querySelector("#sticker-page");
    if (pageInput) pageInput.value = String(activePage);

    const items = (state.stickers || [])
      .filter(item => item.page === activePage)
      .slice()
      .sort((a, b) => Number(b.zIndex ?? 1) - Number(a.zIndex ?? 1));

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "sticker-empty";
      empty.textContent = "本页还没有贴纸";
      list.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "sticker-layer-row";
      row.classList.toggle("active", item.id === selectedId);

      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "sticker-layer-name";
      choose.textContent = item.name || "贴纸";
      choose.title = "选中图层";
      choose.addEventListener("click", () => selectSticker(item.id));

      const visibility = makeButton(item.visible === false ? "显示" : "隐藏",
        item.visible === false ? "显示贴纸" : "隐藏贴纸", async () => {
          item.visible = item.visible === false;
          await saveSticker(item);
          renderEverywhere();
        });

      const lock = makeButton(item.locked ? "解锁" : "锁定",
        item.locked ? "解锁图层" : "锁定图层", async () => {
          item.locked = !item.locked;
          await saveSticker(item);
          renderEverywhere();
        });

      row.append(choose, visibility, lock);
      list.appendChild(row);
    });
  }

  function makeButton(text, title, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    button.addEventListener("click", action);
    return button;
  }

  function createPanel() {
    if (panelReady || document.querySelector("#sticker-panel")) return;
    panelReady = true;

    const panel = document.createElement("section");
    panel.id = "sticker-panel";
    panel.innerHTML = `
      <div class="sticker-panel-head">
        <strong>贴纸图层</strong>
        <button type="button" id="sticker-panel-toggle" title="收起/展开">−</button>
      </div>
      <div id="sticker-panel-body">
        <label class="sticker-field">
          页面编号
          <input id="sticker-page" type="number" min="1" value="1">
        </label>
        <label class="sticker-import">
          导入图片贴纸
          <input id="sticker-file" type="file" accept="image/*" multiple>
        </label>
        <div class="sticker-toolbar">
          <button id="sticker-rename">重命名</button>
          <button id="sticker-duplicate">复制</button>
          <button id="sticker-front">上移</button>
          <button id="sticker-back">下移</button>
          <button id="sticker-delete" class="danger">删除</button>
        </div>
        <div class="sticker-hint">拖动贴纸移动；拖右下角缩放；拖上方旋转手柄旋转。相同页面编号会在所有特效卡片同步。</div>
        <div id="sticker-layer-list"></div>
      </div>`;

    document.body.appendChild(panel);

    // 默认收起贴纸面板，并记住用户选择；不修改贴纸数据
    const stickerCollapseKey = "douyin-sticker-panel-collapsed";
    const stickerToggle = panel.querySelector("#sticker-panel-toggle");
    let stickerCollapsed = true;

    try {
      const savedCollapse = localStorage.getItem(stickerCollapseKey);
      if (savedCollapse === "false") stickerCollapsed = false;
    } catch (error) {
      console.warn("读取贴纸面板折叠状态失败：", error);
    }

    panel.classList.toggle("collapsed", stickerCollapsed);
    stickerToggle.textContent = stickerCollapsed ? "+" : "−";
    stickerToggle.setAttribute("aria-expanded", String(!stickerCollapsed));

    // 可拖动面板：位置保存在浏览器本地，不影响贴纸数据
    const panelHead = panel.querySelector(".sticker-panel-head");
    const positionKey = "douyin-sticker-panel-position";
    let panelDrag = null;

    try {
      const savedPosition = JSON.parse(localStorage.getItem(positionKey) || "null");
      if (savedPosition &&
          Number.isFinite(savedPosition.left) &&
          Number.isFinite(savedPosition.top)) {
        panel.style.left = Math.max(0, Math.min(savedPosition.left,
          window.innerWidth - panel.offsetWidth)) + "px";
        panel.style.top = Math.max(0, Math.min(savedPosition.top,
          window.innerHeight - 40)) + "px";
        panel.style.right = "auto";
      }
    } catch (error) {
      console.warn("读取贴纸面板位置失败：", error);
    }

    panelHead.addEventListener("pointerdown", event => {
      if (event.target.closest("button")) return;
      if (event.button !== 0) return;

      const rect = panel.getBoundingClientRect();
      panelDrag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      panel.style.left = rect.left + "px";
      panel.style.top = rect.top + "px";
      panel.style.right = "auto";
      panelHead.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    panelHead.addEventListener("pointermove", event => {
      if (!panelDrag || event.pointerId !== panelDrag.pointerId) return;

      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - 40);
      const left = Math.max(0, Math.min(maxLeft, event.clientX - panelDrag.offsetX));
      const top = Math.max(0, Math.min(maxTop, event.clientY - panelDrag.offsetY));

      panel.style.left = left + "px";
      panel.style.top = top + "px";
    });

    const finishPanelDrag = event => {
      if (!panelDrag || event.pointerId !== panelDrag.pointerId) return;
      panelDrag = null;
      try {
        const rect = panel.getBoundingClientRect();
        localStorage.setItem(positionKey, JSON.stringify({
          left: rect.left,
          top: rect.top
        }));
      } catch (error) {
        console.warn("保存贴纸面板位置失败：", error);
      }
    };

    panelHead.addEventListener("pointerup", finishPanelDrag);
    panelHead.addEventListener("pointercancel", finishPanelDrag);

    stickerToggle.addEventListener("click", () => {
      stickerCollapsed = !panel.classList.contains("collapsed");
      panel.classList.toggle("collapsed", stickerCollapsed);
      stickerToggle.textContent = stickerCollapsed ? "+" : "−";
      stickerToggle.setAttribute("aria-expanded", String(!stickerCollapsed));

      try {
        localStorage.setItem(stickerCollapseKey, String(stickerCollapsed));
      } catch (error) {
        console.warn("保存贴纸面板折叠状态失败：", error);
      }
    });

    document.querySelector("#sticker-page").addEventListener("change", event => {
      activePage = Math.max(1, Number(event.target.value) || 1);
      selectedId = null;
      renderEverywhere();
    });

    document.querySelector("#sticker-file").addEventListener("change", async event => {
      const files = Array.from(event.target.files || []);
      try {
        for (const file of files) {
          if (!file.type.startsWith("image/")) continue;
          const src = await readFileAsDataURL(file);
          const item = {
            id: uid(),
            page: getPage(),
            name: file.name.replace(/\.[^.]+$/, "") || "贴纸",
            src,
            x: 85,
            y: 100,
            width: 100,
            height: 100,
            rotation: 0,
            zIndex: Date.now() % 1000000,
            visible: true,
            locked: false
          };
          state.stickers.push(item);
          await saveSticker(item);
          selectedId = item.id;
          activePage = item.page;
        }
        renderEverywhere();
      } catch (error) {
        console.error("导入贴纸失败：", error);
        alert("导入或保存贴纸失败。图片可能过大，请尝试较小的图片。");
      } finally {
        event.target.value = "";
      }
    });

    document.querySelector("#sticker-rename").addEventListener("click", async () => {
      const item = getSticker(selectedId);
      if (!item) return alert("请先选中一个图层。");
      const name = prompt("请输入图层名称：", item.name || "贴纸");
      if (name === null) return;
      item.name = name.trim() || "贴纸";
      await saveSticker(item);
      renderEverywhere();
    });

    document.querySelector("#sticker-duplicate").addEventListener("click", async () => {
      const item = getSticker(selectedId);
      if (!item) return alert("请先选中一个图层。");
      const copy = {
        ...item,
        id: uid(),
        name: (item.name || "贴纸") + " 副本",
        x: Math.min(CANVAS_W - 20, item.x + 15),
        y: Math.min(CANVAS_H - 20, item.y + 15),
        zIndex: Date.now() % 1000000,
        locked: false
      };
      state.stickers.push(copy);
      selectedId = copy.id;
      await saveSticker(copy);
      renderEverywhere();
    });

    document.querySelector("#sticker-front").addEventListener("click", async () => {
      const item = getSticker(selectedId);
      if (!item) return alert("请先选中一个图层。");
      const pageItems = state.stickers.filter(s => s.page === item.page);
      item.zIndex = Math.max(0, ...pageItems.map(s => Number(s.zIndex ?? 1))) + 1;
      await saveSticker(item);
      renderEverywhere();
    });

    document.querySelector("#sticker-back").addEventListener("click", async () => {
      const item = getSticker(selectedId);
      if (!item) return alert("请先选中一个图层。");
      const pageItems = state.stickers.filter(s => s.page === item.page);
      item.zIndex = Math.min(0, ...pageItems.map(s => Number(s.zIndex ?? 1))) - 1;
      await saveSticker(item);
      renderEverywhere();
    });

    document.querySelector("#sticker-delete").addEventListener("click", async () => {
      const item = getSticker(selectedId);
      if (!item) return alert("请先选中一个图层。");
      if (!confirm(`确定删除“${item.name || "贴纸"}”吗？`)) return;
      state.stickers = state.stickers.filter(s => s.id !== item.id);
      await removeStickerFromDB(item.id);
      selectedId = null;
      renderEverywhere();
    });

    document.addEventListener("pointerdown", onStickerPointerDown);
    document.addEventListener("pointermove", onStickerPointerMove);
    document.addEventListener("pointerup", onStickerPointerUp);
    document.addEventListener("pointercancel", onStickerPointerUp);
    refreshLayerList();
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function onStickerPointerDown(event) {
    const node = event.target.closest(".sticker-item");
    if (!node) return;

    const item = getSticker(node.dataset.stickerId);
    if (!item) return;

    selectSticker(item.id);
    if (item.locked) return;
    if (event.target.closest(".sticker-name")) return;

    const mode = event.target.closest(".sticker-resize") ? "resize" :
      event.target.closest(".sticker-rotate") ? "rotate" : "move";

    const canvas = node.closest(".canvas-wrap");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / CANVAS_W || 1;
    const scaleY = rect.height / CANVAS_H || 1;

    dragSession = {
      id: item.id,
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation || 0,
      scaleX,
      scaleY
    };

    event.preventDefault();
  }

  function onStickerPointerMove(event) {
    if (!dragSession) return;
    const item = getSticker(dragSession.id);
    if (!item) return;

    const dx = (event.clientX - dragSession.pointerX) / dragSession.scaleX;
    const dy = (event.clientY - dragSession.pointerY) / dragSession.scaleY;

    if (dragSession.mode === "move") {
      item.x = Math.round(Math.max(-item.width + 12,
        Math.min(CANVAS_W - 12, dragSession.x + dx)));
      item.y = Math.round(Math.max(-item.height + 12,
        Math.min(CANVAS_H - 12, dragSession.y + dy)));
    } else if (dragSession.mode === "resize") {
      item.width = Math.round(Math.max(24,
        Math.min(CANVAS_W * 2, dragSession.width + dx)));
      item.height = Math.round(Math.max(24,
        Math.min(CANVAS_H * 2, dragSession.height + dy)));
    } else {
      item.rotation = Math.round(dragSession.rotation + dx);
    }

    syncStickerDOM(item);
  }

  async function onStickerPointerUp() {
    if (!dragSession) return;
    const item = getSticker(dragSession.id);
    dragSession = null;
    if (item) {
      try {
        await saveSticker(item);
        refreshLayerList();
      } catch (error) {
        console.error("保存贴纸位置失败：", error);
      }
    }
  }

  window.restoreStickers = restoreStickers;
  window.renderStickersForCanvas = renderStickersForCanvas;
})();