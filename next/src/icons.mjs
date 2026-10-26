const shapes={
 human:'<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3M8 21v-4m8 4v-4"/>',
 ai:'<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4M10 10h4v4h-4z"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 arrow:'<path d="M6 18 18 6M6 6h12v12"/>',
 down:'<path d="m6 9 6 6 6-6"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
 works:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 link:'<path d="m10 14 4-4m-6 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"/>',
 key:'<circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-4-4 3-3m-6 0 3-3"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 back:'<path d="m14 5-7 7 7 7M7 12h14"/>',
 refresh:'<path d="M20 7a9 9 0 1 0 0 10M20 2v6h-6"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>'
};
export function icon(name,cls=''){return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${shapes[name]||shapes.info}</svg>`}
