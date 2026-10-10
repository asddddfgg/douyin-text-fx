(() => {
  'use strict';

  /*
   * 独立文字图层 MVP
   * - 不修改原有 state.textBox
   * - 不修改原有 drag.js
   * - 不修改原有 stickers.js
   * - 同一分页的所有特效卡片同步显示文字图层
   */

  const STORAGE_KEY = 'douyin_text_layers_v1';

  let layers = [];
  let selectedId = null;
  let nextId = 1;
  let initialized = false;
  let currentPage = 1;

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (Array.isArray(saved.layers)) layers = saved.layers;
    if (Number.isInteger(saved.nextId)) nextId = saved.nextId;
  } catch (err) {
    console.warn('[文字图层] 读取本地数据失败，将使用空图层。', err);
  }

  function makeId() {
    return 'text-layer-' + Date.now().toString(36) + '-' + nextId++;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        layers,
        nextId
      }));
    } catch (err) {
      console.warn('[文字图层] 保存失败。', err);
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function getLayer(id) {
    return layers.find(layer => layer.id === id);
  }

  function getPageNumber(canvas) {
    const card = canvas.closest('.card');
    return Number(card?.dataset.page || 1);
  }

  function selectedLayer(id) {
    selectedId = id;
    document.querySelectorAll('.text-layer-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.layerId === id);
    });
    document.querySelectorAll('.text-layer-row').forEach(el => {
      el.classList.toggle('active', el.dataset.layerId === id);
    });
    renderPanel();
    renderControls();
  }

  function updateLayerNodes(layer) {
    document.querySelectorAll('.text-layer-item').forEach(node => {
      if (node.dataset.layerId !== layer.id) return;

      node.style.left = layer.x + 'px';
      node.style.top = layer.y + 'px';
      node.style.width = layer.w + 'px';
      node.style.minHeight = layer.h + 'px';
      node.style.transform = `rotate(${layer.rotation}deg)`;
      node.style.display = layer.visible ? '' : 'none';

      const text = node.querySelector('.text-layer-content');

      if (text) {
        text.style.fontSize = layer.fontSize + 'px';
        text.style.color = layer.color;
        text.style.fontWeight = layer.bold ? '700' : '400';
        text.style.textAlign = layer.align || 'left';
        text.style.textShadow = layer.shadow
          ? '2px 2px 4px rgba(0,0,0,.65)'
          : 'none';
      }

      if (text && document.activeElement !== text) {
        text.textContent = layer.text;
      }

      node.classList.toggle('selected', selectedId === layer.id);
      node.classList.toggle('locked', !!layer.locked);
    });
  }

  function renderPanel() {
    const list = document.getElementById('textLayerList');
    if (!list) return;

    if (!layers.length) {
      list.innerHTML = '<div class="text-layer-empty">暂无文字图层，点击“添加文字”开始。</div>';
      return;
    }

    list.innerHTML = layers.slice().reverse().map(layer => `
      <div class="text-layer-row ${selectedId === layer.id ? 'active' : ''}"
           data-layer-id="${escapeHtml(layer.id)}">
        <button type="button" class="text-layer-select"
                data-action="select"
                title="选中图层">
          ${escapeHtml(layer.text.slice(0, 14) || '空文字')}
        </button>
        <button type="button" data-action="visibility"
                title="${layer.visible ? '隐藏图层' : '显示图层'}">
          ${layer.visible ? '隐' : '显'}
        </button>
        <button type="button" data-action="lock"
                title="${layer.locked ? '解锁图层' : '锁定图层'}">
          ${layer.locked ? '🔒' : '🔓'}
        </button>
        <button type="button" data-action="duplicate" title="复制图层">复</button>
        <button type="button" data-action="delete" title="删除图层">删</button>
      </div>
    `).join('');
  }

  function renderLayers() {
    document.querySelectorAll('.text-layer-overlay').forEach(el => el.remove());

    document.querySelectorAll('.canvas-wrap').forEach(canvas => {
      const page = getPageNumber(canvas);
      const pageLayers = layers.filter(layer => layer.page === page);

      if (!pageLayers.length) return;

      const overlay = document.createElement('div');
      overlay.className = 'text-layer-overlay';

      pageLayers.forEach(layer => {
        const node = document.createElement('div');
        node.className = 'text-layer-item';
        node.dataset.layerId = layer.id;
        node.style.left = layer.x + 'px';
        node.style.top = layer.y + 'px';
        node.style.width = layer.w + 'px';
        node.style.minHeight = layer.h + 'px';
        node.style.transform = `rotate(${layer.rotation}deg)`;
        node.style.display = layer.visible ? '' : 'none';
        node.style.zIndex = String(100 + layers.indexOf(layer));

        if (selectedId === layer.id) node.classList.add('selected');
        if (layer.locked) node.classList.add('locked');

        node.innerHTML = `
          <div class="text-layer-content">${escapeHtml(layer.text)}</div>
          <button type="button" class="text-layer-handle text-layer-resize"
                  title="拖动调整大小" aria-label="调整大小"></button>
          <button type="button" class="text-layer-handle text-layer-rotate"
                  title="拖动旋转" aria-label="旋转"></button>
        `;

        const content = node.querySelector('.text-layer-content');

        content.style.fontSize = layer.fontSize + 'px';
        content.style.color = layer.color;
        content.style.fontWeight = layer.bold ? '700' : '400';
        content.style.textAlign = layer.align || 'left';
        content.style.textShadow = layer.shadow
          ? '2px 2px 4px rgba(0,0,0,.65)'
          : 'none';

        node.addEventListener('pointerdown', event => {
          if (event.target.closest('.text-layer-handle')) return;
          if (event.target.isContentEditable) return;
          if (event.detail >= 2) return;

          event.stopPropagation();
          selectedLayer(layer.id);

          if (layer.locked) return;

          if (event.button !== 0) return;

          const startX = event.clientX;
          const startY = event.clientY;
          const originalX = layer.x;
          const originalY = layer.y;

          node.setPointerCapture(event.pointerId);

          const move = e => {
            layer.x = Math.round(originalX + e.clientX - startX);
            layer.y = Math.round(originalY + e.clientY - startY);
            updateLayerNodes(layer);
          };

          const up = () => {
            node.removeEventListener('pointermove', move);
            node.removeEventListener('pointerup', up);
            node.removeEventListener('pointercancel', up);
            persist();
            renderPanel();
          };

          node.addEventListener('pointermove', move);
          node.addEventListener('pointerup', up);
          node.addEventListener('pointercancel', up);
        });

        node.addEventListener('contextmenu', event => {
          showLayerContextMenu(layer, event);
        });

        node.addEventListener('dblclick', event => {
  event.stopPropagation();
  if (event.target.closest('.text-layer-handle')) return;
  startEditing(layer.id, node);
});

        content.addEventListener('blur', () => {
          content.contentEditable = 'false';
          layer.text = content.textContent || '';
          persist();

          document.querySelectorAll('.text-layer-item').forEach(peer => {
            if (peer.dataset.layerId !== layer.id) return;
            if (peer.querySelector('.text-layer-content') !== content) {
              peer.querySelector('.text-layer-content').textContent = layer.text;
            }
          });

          renderPanel();
        });

        content.addEventListener('keydown', event => {
          if (event.key === 'Escape') {
            content.blur();
          }

          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            content.blur();
          }
        });

        const resizeHandle = node.querySelector('.text-layer-resize');

        resizeHandle.addEventListener('pointerdown', event => {
          event.preventDefault();
          event.stopPropagation();

          if (layer.locked) return;

          selectedLayer(layer.id);

          const startX = event.clientX;
          const startY = event.clientY;
          const startW = layer.w;
          const startH = layer.h;
          const startFontSize = Number(layer.fontSize) || 28;

          resizeHandle.setPointerCapture(event.pointerId);

          const move = e => {
            layer.w = Math.max(40, Math.min(2000, Math.round(startW + e.clientX - startX)));
            layer.h = Math.max(24, Math.min(2000, Math.round(startH + e.clientY - startY)));

            // 使用拖动开始时的字号计算，避免连续拖动累积误差。
            const ratioW = layer.w / Math.max(1, startW);
            const ratioH = layer.h / Math.max(1, startH);
            const scale = Math.sqrt(ratioW * ratioH);
            layer.fontSize = Math.max(12, Math.min(100, Math.round(startFontSize * scale)));

            const sizeInput = document.getElementById('tlFontSize');
            const sizeValue = document.getElementById('tlFontSizeValue');
            if (sizeInput) sizeInput.value = String(layer.fontSize);
            if (sizeValue) sizeValue.textContent = String(layer.fontSize);

            updateLayerNodes(layer);
          };

          const up = () => {
            resizeHandle.removeEventListener('pointermove', move);
            resizeHandle.removeEventListener('pointerup', up);
            resizeHandle.removeEventListener('pointercancel', up);
            persist();
            renderPanel();
          };

          resizeHandle.addEventListener('pointermove', move);
          resizeHandle.addEventListener('pointerup', up);
          resizeHandle.addEventListener('pointercancel', up);
        });

        const rotateHandle = node.querySelector('.text-layer-rotate');

        rotateHandle.addEventListener('pointerdown', event => {
          event.preventDefault();
          event.stopPropagation();

          if (layer.locked) return;

          selectedLayer(layer.id);

          const rect = node.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const startAngle = Math.atan2(
            event.clientY - centerY,
            event.clientX - centerX
          ) * 180 / Math.PI;
          const startRotation = layer.rotation;

          rotateHandle.setPointerCapture(event.pointerId);

          const move = e => {
            const angle = Math.atan2(
              e.clientY - centerY,
              e.clientX - centerX
            ) * 180 / Math.PI;

            layer.rotation = Math.round(startRotation + angle - startAngle);
            updateLayerNodes(layer);
          };

          const up = () => {
            rotateHandle.removeEventListener('pointermove', move);
            rotateHandle.removeEventListener('pointerup', up);
            rotateHandle.removeEventListener('pointercancel', up);
            persist();
            renderPanel();
          };

          rotateHandle.addEventListener('pointermove', move);
          rotateHandle.addEventListener('pointerup', up);
          rotateHandle.addEventListener('pointercancel', up);
        });

        overlay.appendChild(node);
      });

      canvas.appendChild(overlay);
    });

    renderPanel();
  }

  function addLayer() {
    const page = currentPage;

    const layer = {
      id: makeId(),
      page,
      text: '双击编辑文字',
      x: 24,
      y: 80,
      w: 220,
      h: 50,
      rotation: 0,
      fontSize: 28,
      color: '#000000',
      bold: true,
      align: 'center',
      shadow: true,
      visible: true,
      locked: false
    };

    layers.push(layer);
    selectedId = layer.id;
    persist();
    renderLayers();
    renderControls();

    startEditing(layer.id);
  }

  function startEditing(id, preferredNode = null) {
    const layer = getLayer(id);
    if (!layer) return;

    selectedLayer(id);
    renderControls();

    const nodes = Array.from(
      document.querySelectorAll('.text-layer-item')
    ).filter(node => node.dataset.layerId === id);

    const node = preferredNode && preferredNode.dataset.layerId === id
      ? preferredNode
      : nodes.find(item => {
          const canvas = item.closest('.canvas-wrap');
          return canvas && getPageNumber(canvas) === layer.page;
        }) || nodes[0];

    const content = node?.querySelector('.text-layer-content');
    if (!content) return;

    content.contentEditable = 'true';
    content.focus();

    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function duplicateLayer(id) {
    const source = getLayer(id);
    if (!source) return;

    const copy = {
      ...source,
      id: makeId(),
      x: source.x + 12,
      y: source.y + 12,
      text: source.text + ' 副本'
    };

    layers.push(copy);
    selectedId = copy.id;
    persist();
    renderLayers();
    renderControls();
  }

  function deleteLayer(id) {
    layers = layers.filter(layer => layer.id !== id);

    if (selectedId === id) {
      selectedId = layers.length ? layers[layers.length - 1].id : null;
    }

    persist();
    renderLayers();
    renderControls();
  }

  let activeContextMenu = null;

  function closeContextMenu() {
    if (activeContextMenu) {
      activeContextMenu.remove();
      activeContextMenu = null;
    }
  }

  function showContextMenu(x, y, html, layerId = null) {
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'text-layer-context-menu';
    menu.dataset.layerId = layerId || '';
    menu.innerHTML = html;
    document.body.appendChild(menu);
    activeContextMenu = menu;

    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + 'px';

    menu.addEventListener('click', event => {
      const button = event.target.closest('button[data-menu-action]');
      if (!button) return;

      const id = menu.dataset.layerId;
      const layer = id ? getLayer(id) : null;
      const action = button.dataset.menuAction;

      if (action === 'add-text') {
        closeContextMenu();
        addLayer();
        return;
      }

      if (!layer) return;

      switch (action) {
        case 'select':
          selectedLayer(id);
          renderControls();
          break;
        case 'duplicate':
          duplicateLayer(id);
          break;
        case 'visibility':
          layer.visible = !layer.visible;
          persist();
          renderLayers();
          break;
        case 'lock':
          layer.locked = !layer.locked;
          persist();
          renderLayers();
          break;
        case 'delete':
          deleteLayer(id);
          break;
        case 'bold':
          layer.bold = !layer.bold;
          persist();
          updateLayerNodes(layer);
          renderControls();
          break;
        case 'shadow':
          layer.shadow = !layer.shadow;
          persist();
          updateLayerNodes(layer);
          renderControls();
          break;
        case 'align-left':
        case 'align-center':
        case 'align-right':
          layer.align = action.replace('align-', '');
          persist();
          updateLayerNodes(layer);
          renderControls();
          break;
        case 'back':
        case 'down':
        case 'up':
        case 'front': {
          const pageIndices = [];
          layers.forEach((item, index) => {
            if (item.page === layer.page) pageIndices.push(index);
          });
          const current = layers.findIndex(item => item.id === id);
          const position = pageIndices.indexOf(current);
          if (position < 0) break;

          let targetPosition = position;
          if (action === 'back') targetPosition = 0;
          if (action === 'front') targetPosition = pageIndices.length - 1;
          if (action === 'up') targetPosition = Math.min(pageIndices.length - 1, position + 1);
          if (action === 'down') targetPosition = Math.max(0, position - 1);

          if (targetPosition !== position) {
            const targetIndex = pageIndices[targetPosition];
            const moved = layers.splice(current, 1)[0];
            layers.splice(targetIndex, 0, moved);
            persist();
            renderLayers();
          }
          break;
        }
      }

      closeContextMenu();
    });

    menu.addEventListener('change', event => {
      if (event.target.matches('input[type="color"]')) {
        const layer = getLayer(menu.dataset.layerId);
        if (!layer) return;
        layer.color = event.target.value;
        persist();
        updateLayerNodes(layer);
        renderControls();
        closeContextMenu();
      }
    });
  }

  function showLayerContextMenu(layer, event) {
    event.preventDefault();
    event.stopPropagation();
    selectedLayer(layer.id);

    const html = `
      <button data-menu-action="select">选中图层</button>
      <button data-menu-action="duplicate">复制图层</button>
      <button data-menu-action="visibility">${layer.visible ? '隐藏图层' : '显示图层'}</button>
      <button data-menu-action="bold">${layer.bold ? '取消加粗' : '加粗'}</button>
      <button data-menu-action="shadow">${layer.shadow ? '关闭阴影' : '开启阴影'}</button>
      <label class="text-layer-menu-color">文字颜色 <input type="color" value="${/^#[0-9a-f]{6}$/i.test(layer.color) ? layer.color : '#000000'}"></label>
      <div class="text-layer-menu-label">文字对齐</div>
      <div class="text-layer-menu-row">
        <button data-menu-action="align-left">左对齐</button>
        <button data-menu-action="align-center">居中</button>
        <button data-menu-action="align-right">右对齐</button>
      </div>
      <div class="text-layer-menu-label">图层顺序</div>
      <div class="text-layer-menu-row">
        <button data-menu-action="front">置顶</button>
        <button data-menu-action="up">上移</button>
      </div>
      <div class="text-layer-menu-row">
        <button data-menu-action="down">下移</button>
        <button data-menu-action="back">置底</button>
      </div>
      <button data-menu-action="lock">${layer.locked ? '解锁图层' : '锁定图层'}</button>
      <button data-menu-action="delete" class="text-layer-menu-danger">删除图层</button>
    `;

    showContextMenu(event.clientX, event.clientY, html, layer.id);
  }

  function showCanvasContextMenu(canvas, event) {
    event.preventDefault();
    currentPage = getPageNumber(canvas);

    showContextMenu(event.clientX, event.clientY, `
      <button data-menu-action="add-text">在此页添加文字图层</button>
    `);
  }
  function renderControls() {
    const layer = getLayer(selectedId);

    const controls = document.getElementById('textLayerControls');
    if (!controls) return;

    controls.querySelectorAll('input, select').forEach(input => {
      input.disabled = !layer;
    });

    if (!layer) return;

    controls.querySelector('#tlFontSize').value = layer.fontSize;
    controls.querySelector('#tlFontSizeValue').textContent = layer.fontSize;
    controls.querySelector('#tlColor').value = layer.color;
    controls.querySelector('#tlBold').checked = layer.bold;
    controls.querySelector('#tlAlign').value = layer.align || 'left';
    controls.querySelector('#tlShadow').checked = layer.shadow;
  }

  function setupPanel() {
    if (initialized) return;
    initialized = true;

    const toolbar = document.querySelector('.toolbar-right');
    if (!toolbar) {
      console.warn('[文字图层] 找不到右侧工具栏。');
      return;
    }

    const panel = document.createElement('section');
    panel.id = 'text-layer-panel';
    panel.innerHTML = `
      <div class="text-layer-heading">
        <strong>独立文字图层</strong>
        <div class="text-layer-heading-actions">
          <button type="button" class="btn" id="addTextLayerBtn">＋ 添加文字</button>
          <button type="button" class="btn" id="toggleTextLayerPanel"
                  aria-expanded="false" title="展开/收起文字图层">展开 ▾</button>
        </div>
      </div>

      <div id="textLayerPanelBody">
      <div id="textLayerList"></div>

      <button type="button" id="toggleTextLayerControls"
              class="text-layer-controls-toggle" aria-expanded="false">
        <span>⚙ 文字属性设置</span>
        <span id="textLayerControlsToggleLabel">展开 ▾</span>
      </button>

      <div id="textLayerControls" hidden>
        <div class="text-layer-control">
          <label for="tlFontSize">字号</label>
          <input id="tlFontSize" type="range" min="12" max="100" value="28">
          <span id="tlFontSizeValue">28</span>px
        </div>

        <div class="text-layer-control">
          <label for="tlColor">颜色</label>
          <input id="tlColor" type="color" value="#ffffff">
          <label><input id="tlBold" type="checkbox" checked> 加粗</label>
          <label><input id="tlShadow" type="checkbox" checked> 阴影</label>
        </div>

        <div class="text-layer-control">
          <label for="tlAlign">对齐</label>
          <select id="tlAlign">
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
          </select>
        </div>

        <div class="text-layer-hint">
          单击选中；拖动移动；双击编辑。选中后可拖动右下角缩放、顶部圆点旋转。
        </div>
      </div>
      </div>
    `;

    toolbar.prepend(panel);

    // 折叠/展开属性区，不影响图层数据和属性同步
    const controlsToggle = panel.querySelector('#toggleTextLayerControls');
    const controls = panel.querySelector('#textLayerControls');
    const controlsToggleLabel = panel.querySelector('#textLayerControlsToggleLabel');

    controlsToggle.addEventListener('click', () => {
      const willExpand = controls.hidden;
      controls.hidden = !willExpand;
      controlsToggle.setAttribute('aria-expanded', String(willExpand));
      controlsToggleLabel.textContent = willExpand ? '收起属性 ▴' : '展开 ▾';
    });

    // 整个文字图层面板默认收起，并记住用户的选择
    const textPanelToggle = panel.querySelector('#toggleTextLayerPanel');
    const textPanelBody = panel.querySelector('#textLayerPanelBody');
    const textPanelStateKey = 'douyin-text-layer-panel-state';

    let textPanelExpanded = false;
    try {
      textPanelExpanded =
        localStorage.getItem(textPanelStateKey) === 'expanded';
    } catch (error) {
      console.warn('[文字图层] 读取面板状态失败：', error);
    }

    panel.classList.toggle('collapsed', !textPanelExpanded);
    textPanelBody.hidden = !textPanelExpanded;
    textPanelToggle.setAttribute('aria-expanded', String(textPanelExpanded));
    textPanelToggle.textContent = textPanelExpanded ? '收起 ▴' : '展开 ▾';

    textPanelToggle.addEventListener('click', () => {
      textPanelExpanded = textPanelBody.hidden;
      textPanelBody.hidden = !textPanelExpanded;
      panel.classList.toggle('collapsed', !textPanelExpanded);
      textPanelToggle.setAttribute('aria-expanded', String(textPanelExpanded));
      textPanelToggle.textContent = textPanelExpanded ? '收起 ▴' : '展开 ▾';

      try {
        localStorage.setItem(
          textPanelStateKey,
          textPanelExpanded ? 'expanded' : 'collapsed'
        );
      } catch (error) {
        console.warn('[文字图层] 保存面板状态失败：', error);
      }
    });

    document.addEventListener('pointerdown', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const canvas = target.closest('.canvas-wrap');
      if (canvas) {
        currentPage = getPageNumber(canvas);
      }
    }, true);

    document.addEventListener('contextmenu', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.text-layer-item')) return;
      if (target.closest('.sticker-item')) return;
      if (target.closest('#text-layer-panel, #sticker-panel')) return;

      const canvas = target.closest('.canvas-wrap');
      if (canvas) showCanvasContextMenu(canvas, event);
    });

    document.addEventListener('pointerdown', event => {
      if (activeContextMenu && !activeContextMenu.contains(event.target)) {
        closeContextMenu();
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeContextMenu();
    });
    panel.querySelector('#addTextLayerBtn').addEventListener('click', addLayer);

    panel.querySelector('#textLayerList').addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;

      const row = button.closest('[data-layer-id]');
      const id = row?.dataset.layerId;
      const layer = getLayer(id);
      if (!layer) return;

      switch (button.dataset.action) {
        case 'select':
          selectedLayer(id);
          renderControls();
          break;


        case 'visibility':
          layer.visible = !layer.visible;
          persist();
          renderLayers();
          break;

        case 'lock':
          layer.locked = !layer.locked;
          persist();
          renderLayers();
          break;

        case 'duplicate':
          duplicateLayer(id);
          break;

        case 'delete':
          deleteLayer(id);
          break;
      }
    });

    const bindControl = (selector, key, convert = value => value) => {
      panel.querySelector(selector).addEventListener('input', event => {
        const layer = getLayer(selectedId);
        if (!layer) return;

        layer[key] = convert(event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value);

        if (key === 'fontSize') {
          panel.querySelector('#tlFontSizeValue').textContent = layer.fontSize;
        }

        persist();
        updateLayerNodes(layer);
      });
    };

    bindControl('#tlFontSize', 'fontSize', Number);
    bindControl('#tlColor', 'color');
    bindControl('#tlBold', 'bold');
    bindControl('#tlShadow', 'shadow');
    bindControl('#tlAlign', 'align');

    renderPanel();
    renderControls();
  }

  /*
   * 在原有 renderAllCards 完成后重绘新图层。
   * 原函数保留，不替换其内部实现。
   */
  const originalRenderAllCards = window.renderAllCards;

  if (typeof originalRenderAllCards === 'function') {
    window.renderAllCards = function (...args) {
      const result = originalRenderAllCards.apply(this, args);
      renderLayers();
      return result;
    };
  } else {
    console.warn('[文字图层] 暂时没有找到 renderAllCards。');
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupPanel();
    renderLayers();
  });

  window.TextLayers = {
    add: addLayer,
    render: renderLayers,
    getAll: () => layers.map(layer => ({ ...layer }))
  };
})();

