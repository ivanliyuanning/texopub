const names={
'humanities':['Humanities and arts','From objects and history to art and literature',{museums:'Museums and artifacts',history:'History and culture',arts:'Art and design',literature:'Literature and reading'}],
travel:['Travel and places','Explore a city or plan a journey',{destinations:'Destination guides',itineraries:'Itineraries and routes',places:'Cities and geography'}],
living:['Everyday life','Practical ideas for everyday living',{home:'Home and organization',food:'Food and cooking',gardening:'Gardening and care',shopping:'Shopping and choices'}],
science:['Science and nature','Observe the world and understand how it works',{nature:'Nature and ecology',explainers:'Science explained',experiments:'Experiments and exploration'}],
technology:['Technology and AI','Understand technology and put it to work',{ai:'Artificial intelligence',software:'Software and programming',hardware:'Hardware and networks',data:'Data and visualization'}],
'sports-health':['Sports and health','Movement, wellbeing and the outdoors',{sports:'Sports and training',health:'Health knowledge',outdoors:'Outdoor recreation'}],
work:['Work and business','Products, organizations and ways of working',{products:'Industries and products',management:'Business and management',productivity:'Careers and productivity'}],
education:['Learning and education','Understand, remember and share knowledge',{subjects:'Academic subjects',languages:'Language learning',study:'Study methods',teaching:'Teaching resources'}]
};
export function englishCategory(id,fallback=''){const [group,child]=String(id||'').split('/');return child?(names[group]?.[2]?.[child]||fallback):(names[group]?.[0]||fallback)}
export function englishTaxonomy(data){return {...data,groups:data.groups.map(g=>({...g,name:englishCategory(g.id,g.name),description:names[g.id]?.[1]||g.description,children:g.children.map(c=>({...c,name:englishCategory(g.id+'/'+c.id,c.name)}))}))}}
