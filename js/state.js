const state = {
  text: '',
  fontSize: 18,
  lineHeight: 1.4,
  letterSpacing: 0,
  align: 'left',
  bold: false,
  textColor: null,
  bgColor: '#f5f5f5',
  bgImage: null,
  bgBrightness: 1,
  bgOpacity: 1,
  customFont: null,
  customFontName: null,
  viewMode: 'phone',
  exportScale: 3,
  textBox: {
    x: null,
    y: null,
    w: 210,
    h: 200
  },
  savedBgs: [],
  enabledEffects: new Set(EFFECTS.map(e => e.id)),
  stickers: [],
  presets: JSON.parse(localStorage.getItem('douyin_presets') || '[]')
};