/* ══════════════════════════════════════════════════════════════
   Sylcla · 站点配置
   档案 / 设定集 / 点滴 / 邮箱 / 你我之间 / 通话 / 纪念日
   所有内容都存在浏览器本地，可自由增删改
   ══════════════════════════════════════════════════════════════ */

window.SYLCLA = (function () {
  'use strict';

  /* 六枚独立纹章：纯宝 = 百合 / 玫瑰 / 十字架；秦彻 = 曼陀罗花 / 羽毛 / 渡鸦 */
  const emblems = {
    lily: '<img src="assets/img/crests/lily.png?v=20261119" alt="百合">',
    rose: '<img src="assets/img/crests/rose.png?v=20261119" alt="玫瑰">',
    cross: '<img src="assets/img/crests/cross.png?v=20261119" alt="十字架">',
    floral: '<img src="assets/img/crests/floral.png?v=20261119" alt="曼陀罗花">',
    feather: '<img src="assets/img/crests/feather.png?v=20261119" alt="羽毛">',
    raven: '<img src="assets/img/crests/raven.png?v=20261119" alt="渡鸦">'
  };

  /* 档案：固定的两个人，各带三枚独立纹章 */
  const dossiers = [
    {
      id: 'chunbao',
      name: '纯宝',
      en: 'CLARA',
      alias: '我',
      work: '',
      age: '',
      birthday: '',
      height: '',
      identity: '',
      place: '',
      gender: '',
      relation: '',
      intro: '档案的主人。所有记录，都从这里开始。',
      appearance: '',
      habits: '',
      likes: '',
      dislikes: '',
      experience: [],
      tags: [],
      bond: 100,
      photo: ''
    },
    {
      id: 'qinche',
      name: '秦彻',
      en: 'SYLUS',
      alias: '他',
      work: '《恋与深空》',
      age: '',
      birthday: '',
      height: '',
      identity: '',
      place: '',
      gender: '',
      relation: '',
      intro: '只出现在纯宝的档案里。',
      appearance: '',
      habits: '',
      likes: '',
      dislikes: '',
      experience: [],
      tags: [],
      bond: 100,
      photo: ''
    }
  ];

  const dossierCrests = {
    chunbao: ['lily', 'rose', 'cross'],
    qinche: ['floral', 'feather', 'raven']
  };

  /* 设定集：从空白开始，全部由你自己添加 */
  const lore = [];

  const moods = ['心悸', '温柔', '疼痛', '失重', '眷恋', '窒息', '平静', '贪心'];
  const weathers = ['晴', '雨', '雪', '阴', '雾', '夜'];
  const kinds = ['人物', '世界观', '地点', '关系', '其他'];

  const modules = [
    {
      id: 'dossiers',
      name: '档案',
      formName: '档案',
      en: 'DOSSIERS',
      title: '档案',
      desc: '十指相扣时，我想你的掌纹里也有我的命运。',
      addLabel: '编辑档案',
      emptyTitle: '档案还没有写好',
      emptyDesc: '这一页留给纯宝和秦彻。',
      emptyEn: 'NO DOSSIER YET',
      fields: [
        { key: 'name', label: '姓名', en: 'NAME', type: 'text', required: true, max: 24, placeholder: '他叫什么' },
        { key: 'en', label: '英文名', en: 'ROMAN', type: 'text', max: 30, placeholder: 'SYLUS' },
        { key: 'alias', label: '称号', en: 'ALIAS', type: 'text', max: 16, placeholder: '我 / 他' },
        { key: 'work', label: '出处', en: 'FROM', type: 'text', max: 24, placeholder: '《…》' },
        { key: 'age', label: '年龄', en: 'AGE', type: 'text', max: 20, placeholder: '27 岁' },
        { key: 'birthday', label: '生日', en: 'BIRTHDAY', type: 'text', max: 20, placeholder: '1 月 23 日' },
        { key: 'height', label: '身高', en: 'HEIGHT', type: 'text', max: 20, placeholder: '185 cm' },
        { key: 'identity', label: '身份', en: 'IDENTITY', type: 'text', max: 30, placeholder: '猎人 / 深空 / 现世' },
        { key: 'place', label: '地点', en: 'PLACE', type: 'text', max: 30, placeholder: '临空市 / 雪原' },
        { key: 'gender', label: '性别', en: 'GENDER', type: 'text', max: 10, placeholder: '男 / 女 / 其他' },
        { key: 'relation', label: '与纯宝的关系', en: 'RELATION', type: 'text', max: 30, placeholder: '恋人 / 唯一' },
        { key: 'bond', label: '羁绊', en: 'BOND', type: 'range', min: 0, max: 100, value: 100 },
        { key: 'photo', label: '照片', en: 'PORTRAIT', type: 'image', wide: true },
        { key: 'intro', label: '一句自我介绍', en: 'INTRO', type: 'textarea', wide: true, max: 120, rows: 2, placeholder: '用一句话介绍这一页。' },
        { key: 'appearance', label: '外貌', en: 'APPEARANCE', type: 'textarea', wide: true, max: 500, rows: 3, placeholder: '眼睛、头发、声音、身上的味道……' },
        { key: 'habits', label: '习惯', en: 'HABITS', type: 'textarea', wide: true, max: 500, rows: 3, placeholder: '他习惯性做的事。' },
        { key: 'likes', label: '喜欢', en: 'LIKES', type: 'textarea', wide: true, max: 400, rows: 2, placeholder: '喜欢的东西、时刻、称呼……' },
        { key: 'dislikes', label: '讨厌', en: 'DISLIKES', type: 'textarea', wide: true, max: 400, rows: 2, placeholder: '不喜欢的东西、被怎样对待……' },
        { key: 'experience', label: '个人经历', en: 'TIMELINE', type: 'nodes', wide: true },
        { key: 'tags', label: '标签', en: 'TAGS', type: 'tags', wide: true, placeholder: '唯一 / 偏爱 / 占有' }
      ]
    },
    {
      id: 'lore',
      name: '设定集',
      formName: '设定',
      en: 'LORE',
      title: '设定集',
      desc: '不管在哪一个世界，我都会找到你，踏上和你一起的必经之路。',
      addLabel: '新增设定',
      emptyTitle: '设定集还是空的',
      emptyDesc: '第一个名字，是故事的起点。',
      emptyEn: 'NO LORE YET',
      fields: [
        { key: 'name', label: '标题', en: 'TITLE', type: 'text', required: true, max: 40, placeholder: '人物、地点、某段关系…' },
        { key: 'kind', label: '类别', en: 'KIND', type: 'select', options: kinds.map((k) => ({ v: k, t: k })), value: '人物' },
        { key: 'subtitle', label: '副标题', en: 'SUBTITLE', type: 'text', max: 30, placeholder: '英文名 / 代号' },
        { key: 'work', label: '出处', en: 'FROM', type: 'text', max: 30, placeholder: '《…》' },
        { key: 'relation', label: '人物关系', en: 'RELATION', type: 'textarea', wide: true, max: 300, rows: 3, placeholder: '与纯宝：…… / 与秦彻：…… / 与其他设定：……' },
        { key: 'tags', label: '标签', en: 'TAGS', type: 'tags', wide: true, placeholder: '唯一 / 偏爱 / 占有' },
        { key: 'body', label: '设定内容', en: 'TEXT', type: 'textarea', wide: true, required: true, max: 2000, rows: 7, placeholder: '写下关于人物、地点或世界的设定……' }
      ]
    },
    {
      id: 'daily',
      name: '点滴',
      en: 'MOMENTS',
      title: '点滴',
      desc: '想和你做这些事，本来就是蓄谋已久。',
      addLabel: '记一笔点滴',
      emptyTitle: '今天还没有留下什么',
      emptyDesc: '一句话、一张图、一个瞬间，都算数。',
      emptyEn: 'NOTHING TODAY',
      fields: [
        { key: 'date', label: '日期', en: 'DATE', type: 'date', required: true },
        { key: 'mood', label: '情绪', en: 'MOOD', type: 'mood', wide: true },
        { key: 'image', label: '图片', en: 'IMAGE', type: 'image', wide: true },
        { key: 'text', label: '内容', en: 'TEXT', type: 'textarea', wide: true, required: true, max: 400, rows: 5, placeholder: '今天他说的那句话，或者什么都没说。' }
      ]
    },
    {
      id: 'mail',
      name: '邮箱',
      en: 'MAIL',
      title: '往来信箱',
      desc: '目光所及的世界，与你。',
      addLabel: '写一封信',
      emptyTitle: '信箱是空的',
      emptyDesc: '第一封信，不必寄得出去。',
      emptyEn: 'EMPTY MAILBOX',
      fields: [
        { key: 'date', label: '日期', en: 'DATE', type: 'date', required: true },
        { key: 'direction', label: '方向', en: 'FROM / TO', type: 'segmented', wide: true, options: ['寄出', '收到'], value: '寄出' },
        { key: 'subject', label: '主题', en: 'SUBJECT', type: 'text', required: true, max: 40, placeholder: '见字如面' },
        { key: 'body', label: '正文', en: 'LETTER', type: 'textarea', wide: true, required: true, max: 2000, rows: 8, placeholder: '写给他，或者写给自己……' }
      ]
    },
    {
      id: 'space',
      name: '你我之间',
      en: 'BETWEEN US',
      title: '你我之间',
      desc: '两颗缠绕的心，会走同一条路。',
      addLabel: '发一条',
      emptyTitle: '墙上还是空的',
      emptyDesc: '一条短句、一张图，也可以钉在这里。',
      emptyEn: 'EMPTY WALL',
      fields: [
        { key: 'date', label: '日期', en: 'DATE', type: 'date', required: true },
        { key: 'place', label: '地点', en: 'PLACE', type: 'text', max: 24, placeholder: '雪原 / 渡口 / 他怀里' },
        { key: 'mood', label: '情绪', en: 'MOOD', type: 'mood', wide: true },
        { key: 'image', label: '图片', en: 'IMAGE', type: 'image', wide: true },
        { key: 'text', label: '内容', en: 'TEXT', type: 'textarea', wide: true, required: true, max: 400, rows: 5, placeholder: '写一句想钉在墙上的话。' }
      ]
    },
    {
      id: 'anniversary',
      name: '纪念日',
      formName: '纪念日',
      en: 'ANNIVERSARY',
      title: '纪念日',
      desc: '和你的每个时刻都值得纪念',
      addLabel: '新增纪念日',
      fields: [
        { key: 'date', label: '日期', en: 'DATE', type: 'date', required: true },
        { key: 'title', label: '名字', en: 'TITLE', type: 'text', required: true, max: 30, placeholder: '相遇 / 第一次牵手 / 那天' },
        { key: 'note', label: '备注', en: 'NOTE', type: 'textarea', wide: true, max: 300, rows: 3, placeholder: '想记住的细节。' }
      ]
    },
    {
      id: 'calls',
      name: '通话',
      en: 'CALLS',
      title: '通话记录',
      desc: '想找人聊天时，可以找我',
      addLabel: '补一条通话',
      emptyTitle: '还没有通话记录',
      emptyDesc: '下一次听见他声音，就记下来。',
      emptyEn: 'NO CALLS YET',
      fields: [
        { key: 'date', label: '日期', en: 'DATE', type: 'date', required: true },
        { key: 'direction', label: '类型', en: 'TYPE', type: 'segmented', wide: true, options: ['拨出', '来电', '未接'], value: '拨出' },
        { key: 'minutes', label: '通话时长（分钟）', en: 'MINUTES', type: 'number', required: true, min: 0, max: 9999, value: 1 },
        { key: 'note', label: '备注', en: 'NOTE', type: 'textarea', wide: true, max: 300, rows: 4, placeholder: '他说了什么，或者只是呼吸声。' }
      ]
    }
  ];

  return {
    brand: { name: 'Sylcla', en: 'SYLCLA ARCHIVE' },
    modules: modules,
    dossiers: dossiers,
    dossierCrests: dossierCrests,
    lore: lore,
    emblems: emblems,
    kinds: kinds,
    moods: moods,
    weathers: weathers,
    storageKey: 'sylcla.data.v1'
  };
})();
