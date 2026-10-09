const state = {
  text: `今天也要元气满满，加油！冲冲冲。\n这是一段较长的测试文本，如果在框内自动折行或者手动换行超过设定的行数，就会自动分页生成第二张图片。\n这里是超过8行后的内容，会自动归入第2张卡片！`,
  fontSize: 18,
  lineHeight: 1.4,
  letterSpacing: 0,
  align: 'left', // 默认左对齐
  bold: false,
  linesPerPage: 8, // 默认单卡片最多 8 行，第 9 行及以后切分至下一张图
  textColor: null,
  bgColor: '#f5f5f5',
  bgImage: null,
  bgBrightness: 1,
  bgOpacity: 1,
  viewMode: 'phone',
  exportScale: 3,
  enabledEffects: new Set(EFFECTS.map(e => e.id)),
  textBox: { x: 30, y: 160, w: 210, h: 120 },
  customFont: null,
  customFontName: null,
  savedBgs: [],
  presets: JSON.parse(localStorage.getItem('douyin_presets') || '[]'),
};