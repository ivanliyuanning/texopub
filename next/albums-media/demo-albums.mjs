/** Layout fixtures use existing public catalog entries; they never change listing. */
export const demoAlbums=[
 {id:'demo-museums',title:'博物馆漫游',summary:'沿着器物、展柜与城市，读懂两座博物馆。',cover:'/assets/album-museums.svg',select:w=>w.format==='guide'},
 {id:'demo-reading',title:'阅读伴页',summary:'阅读时随手打开，把人物与关系理清楚。',cover:'/assets/album-reading.svg',select:w=>w.category_id==='humanities/literature'},
 {id:'demo-tools',title:'交互小工具',summary:'把一个具体问题，做成打开就能使用的小工具。',cover:'/assets/album-tools.svg',select:w=>w.format==='tool'}
];
