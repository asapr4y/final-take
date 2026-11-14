// Deterministic SVG geometry. The hero has no photographic or generated backdrop.
const palette = ['#dab376', '#ab693c', '#e0c399', '#5f4b35'];

function windows(x, y, columns, rows, dx, dy, width = 12, height = 22) {
  return Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) => {
    const lit = (row * 7 + col * 3) % 11 < 4;
    return `<rect x="${x + col * dx}" y="${y + row * dy}" width="${width}" height="${height}" fill="${lit ? palette[(row + col) % palette.length] : '#171b1d'}" opacity="${lit ? '.48' : '.8'}"/><path d="M${x + col * dx + width / 2} ${y + row * dy}v${height}" stroke="#070b0e" stroke-width="1.4"/>`;
  }).join('')).join('');
}

function bulbs(x1, y1, x2, y2, count, radius = 3) {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return `<circle cx="${(x1 + (x2 - x1) * t).toFixed(1)}" cy="${(y1 + (y2 - y1) * t).toFixed(1)}" r="${radius}"/>`;
  }).join('');
}

function neon(text, x, y, size, color = '#e9503b', extra = '') {
  const props = `x="${x}" y="${y}" text-anchor="middle" font-family="Arial Narrow,Arial,sans-serif" font-size="${size}" font-weight="600" letter-spacing="2" ${extra}`;
  return `<text ${props} fill="none" stroke="${color}" stroke-width="5" opacity=".65" filter="url(#ftc-neon-glow)">${text}</text><text ${props} fill="#20100e" stroke="${color}" stroke-width="2.8">${text}</text><text ${props} fill="none" stroke="#ffe9cf" stroke-width=".7">${text}</text>`;
}

function person(x, y, scale, coat = '#292b2b', facing = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cx="0" cy="-33" rx="4.1" ry="5.1" fill="#8c674d"/><path d="M-4-34q0-8 7-4l2 4-3-1-1-3-5 3" fill="#141719"/><path d="M-5-26q5-3 10 0l4 18-4 1-1-9 1 16H-6l2-16-2 10-4-2Z" fill="${coat}"/><path d="m-3-1-1 17m7-17 2 17" stroke="#101416" stroke-width="3.5"/><path d="m-4 16-${facing * 3} 1m12-1 3 1" stroke="#080c0e" stroke-width="3"/></g>`;
}

function taxi() {
  return `<g transform="translate(230) scale(-1 1)"><path d="M14 47 35 41 63 11h82l35 31 40 14 5 34H7Z" fill="url(#ftc-taxi)" stroke="#171716" stroke-width="3"/><path d="M67 16h35v27H43Zm42 0h32l30 27h-62Z" fill="#222d2f" stroke="#a3813b" stroke-width="2"/><path d="m72 20-19 19h42V20Zm46 0v19h40l-20-19Z" fill="#71807a" opacity=".24"/><rect x="20" y="54" width="191" height="7" fill="#343026"/><path d="M23 54h12m12 0h12m12 0h12m12 0h12m12 0h12m12 0h12m12 0h12m12 0h12" stroke="#d4bd7c" stroke-width="5"/><path d="M108 66h12m31-17v30M57 49v30" fill="none" stroke="#736135" stroke-width="1.5"/><rect x="86" y="0" width="42" height="13" rx="2" fill="#eee2ae" stroke="#4c4329"/><text x="107" y="9" fill="#27241d" font-family="Arial,sans-serif" font-size="8" font-weight="700" text-anchor="middle">TAXI</text><text x="114" y="75" fill="#393426" font-family="Arial,sans-serif" font-size="7" font-weight="700" text-anchor="middle">NEW YORK CITY</text><rect x="204" y="61" width="15" height="9" rx="2" fill="#ffe8b8"/><path d="m218 61 115-19v49L218 69Z" fill="url(#ftc-headlight)"/><rect x="9" y="62" width="8" height="7" fill="#d24632"/><path d="M5 82h219" stroke="#b9b6a6" stroke-width="5"/><g transform="translate(48 85)"><circle r="17" fill="#101516"/><g class="scene-wheel"><circle r="9" fill="#9c9d90" stroke="#4a4c49" stroke-width="2"/><path d="M-8 0H8M0-8V8m-6-6L6 6M-6 6 6-6" stroke="#3e4240" stroke-width="2"/></g></g><g transform="translate(177 85)"><circle r="17" fill="#101516"/><g class="scene-wheel"><circle r="9" fill="#9c9d90" stroke="#4a4c49" stroke-width="2"/><path d="M-8 0H8M0-8V8m-6-6L6 6M-6 6 6-6" stroke="#3e4240" stroke-width="2"/></g></g></g>`;
}

export function renderCityScene() {
  const canopy = Array.from({ length: 4 }, (_, row) => bulbs(492 + row * 24, 638 + row * 17, 1282 - row * 24, 638 + row * 17, 39 - row * 2, 2.5)).join('');
  const crowd = Array.from({ length: 24 }, (_, i) => person(528 + i * 30, 811 + i % 4 * 5, .87 + i % 4 * .07, ['#31343a', '#7b5239', '#5b5c51', '#292c31'][i % 4])).join('');
  return `<svg class="city-architecture" viewBox="0 0 1774 910" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="ftc-sky" x2="0" y2="1"><stop stop-color="#080a0e"/><stop offset=".7" stop-color="#1c2029"/><stop offset="1" stop-color="#15171c"/></linearGradient>
    <linearGradient id="ftc-brick" x2="1" y2=".2"><stop stop-color="#191b20"/><stop offset=".5" stop-color="#2c2527"/><stop offset="1" stop-color="#171b20"/></linearGradient>
    <linearGradient id="ftc-metal" x2="0" y2="1"><stop stop-color="#999a99"/><stop offset=".08" stop-color="#3b3f44"/><stop offset=".6" stop-color="#6b6c6c"/><stop offset="1" stop-color="#272c32"/></linearGradient>
    <linearGradient id="ftc-screen" x2=".8" y2="1"><stop stop-color="#15181e"/><stop offset=".5" stop-color="#090b0f"/><stop offset="1" stop-color="#11141a"/></linearGradient>
    <linearGradient id="ftc-board" x2="0" y2="1"><stop stop-color="#c5c9cb"/><stop offset=".3" stop-color="#f4f5f4"/><stop offset=".7" stop-color="#e4e7e8"/><stop offset="1" stop-color="#b8bec1"/></linearGradient>
    <linearGradient id="ftc-canopy" x2="0" y2="1"><stop stop-color="#533032"/><stop offset="1" stop-color="#171b21"/></linearGradient>
    <linearGradient id="ftc-door" x2="0" y2="1"><stop stop-color="#ad8962"/><stop offset=".3" stop-color="#292b2c"/><stop offset="1" stop-color="#14191e"/></linearGradient>
    <linearGradient id="ftc-road" x2="0" y2="1"><stop stop-color="#1a1f28"/><stop offset=".5" stop-color="#10151c"/><stop offset="1" stop-color="#21252f"/></linearGradient>
    <linearGradient id="ftc-taxi" x2="0" y2="1"><stop stop-color="#cbae50"/><stop offset=".5" stop-color="#a98235"/><stop offset="1" stop-color="#53432c"/></linearGradient>
    <linearGradient id="ftc-headlight"><stop stop-color="#f1e8ce" stop-opacity=".3"/><stop offset="1" stop-color="#f1e8ce" stop-opacity="0"/></linearGradient>
    <linearGradient id="ftc-reflection" x2="0" y2="1"><stop stop-color="#d9dce1" stop-opacity=".3"/><stop offset="1" stop-color="#d9dce1" stop-opacity="0"/></linearGradient>
    <pattern id="ftc-masonry" width="75" height="32" patternUnits="userSpaceOnUse"><path d="M0 0H75M0 16H75M37 0V16M0 16V32M75 16V32" fill="none" stroke="#9f827c" stroke-width="1" opacity=".1"/></pattern>
    <pattern id="ftc-floor" width="90" height="18" patternUnits="userSpaceOnUse"><path d="M0 0H90M0 9h65m10 0h15" stroke="#b6bfcc" stroke-width=".7" opacity=".1"/></pattern>
    <filter id="ftc-neon-glow" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="ftc-lamp-glow" x="-5%" y="-80%" width="110%" height="260%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2.6"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1774" height="1040" fill="url(#ftc-sky)"/>
  <g class="scene-skyline">
    <path d="M0 0h160v825H0zm181 0h208v820H181zm223 45h114v781H404zm860-45h157v820h-157zm182 0h328v825h-328Z" fill="#12161c"/>
    ${windows(12, 30, 5, 17, 29, 46, 10, 20)}${windows(191, 5, 6, 16, 33, 47, 11, 19)}${windows(425, 66, 3, 15, 28, 46, 9, 18)}
    ${windows(1283, 22, 4, 17, 31, 46, 10, 19)}${windows(1465, 12, 9, 17, 33, 47, 12, 20)}
    <path d="M166 0v828M398 0v821M1427 0v815M1617 0v830" stroke="#32343b" stroke-width="5"/>
  </g>
  <g class="scene-poster-towers">
    <path d="M157 88 441 62v752l-284 12Zm1176-26 284 26v738l-284-12Z" fill="url(#ftc-brick)" stroke="#373b42" stroke-width="4"/>
    <path d="M164 126h266v588H164Zm1180 0h266v588h-266Z" fill="#12161b"/>
    <g class="scene-neon-cinema">${neon('CINEMA', 297, 121, 31)}${neon('PICTURES', 1476, 121, 29)}</g>
    <path d="M174 620h250v82H174Zm1176 0h250v82h-250Z" fill="#e1e4e5" stroke="#5e6268" stroke-width="7"/>
    <path d="M178 642h242m-242 22h242m934-22h242m-242 22h242" stroke="#777e85" stroke-width="1" opacity=".5"/>
    <text x="299" y="674" text-anchor="middle" fill="#212630" font-family="Arial,sans-serif" font-size="39" font-weight="900" letter-spacing="4">35 MM</text>
    <text x="1475" y="669" text-anchor="middle" fill="#212630" font-family="Arial,sans-serif" font-size="26" font-weight="900">AFTER HOURS</text>
    <path d="M188 730h219v88H188Zm1176 0h219v88h-219Z" fill="url(#ftc-door)" stroke="#59545a" stroke-width="3"/>
    <path d="M297 730v87m1177-87v87M155 713h286m892 0h286" stroke="#67666b" stroke-width="3"/>
    <g fill="#ecdfc8" filter="url(#ftc-lamp-glow)">${bulbs(178, 615, 420, 615, 19, 2.4)}${bulbs(1354, 615, 1596, 615, 19, 2.4)}</g>
  </g>
  <g class="scene-main-theater">
    <path d="M449 0h876v837H449Z" fill="url(#ftc-brick)"/>
    <path d="M449 0h876v837H449Z" fill="url(#ftc-masonry)"/>
    ${windows(493, 1, 12, 2, 68, 38, 24, 23)}
    <path d="M453 0v824m868-824v824" stroke="#0c0f14" stroke-width="15"/>
    <path d="M462 132V820m850-688v688" stroke="#ce493f" stroke-width="3" opacity=".8"/>
    <path d="M640 117h90v-9h48m356 9h-90v-9h-48" fill="none" stroke="#90979f" stroke-width="2"/>
    <g class="scene-neon-midnight">${neon('OPEN ALL NIGHT', 887, 114, 19, '#db6356')}</g>
    <rect x="465" y="141" width="844" height="356" fill="url(#ftc-metal)" stroke="#080b0e" stroke-width="6"/>
    <rect x="480" y="156" width="814" height="326" fill="#1a1e25" stroke="#777d84" stroke-width="2"/>
    <rect x="494" y="170" width="786" height="298" fill="url(#ftc-screen)" stroke="#080b0f" stroke-width="5"/>
    <path d="M506 181h762M506 457h762" stroke="#464b55" stroke-width="1"/>
    <g fill="#eee6d5" filter="url(#ftc-lamp-glow)">${bulbs(475, 150, 1299, 150, 52, 2.8)}${bulbs(1299, 150, 1299, 487, 23, 2.8)}${bulbs(1299, 487, 475, 487, 52, 2.8)}${bulbs(475, 487, 475, 150, 23, 2.8)}</g>
    <path class="scene-bulb-runner" d="M475 150H1299V487H475Z" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="1 19"/>
    <path d="M465 502h844v116H465Z" fill="url(#ftc-metal)" stroke="#10151b" stroke-width="5"/>
    <path d="M485 519h804v81H485Z" fill="url(#ftc-board)" stroke="#9ba2a8" stroke-width="2"/>
    <path d="M486 535h802m-802 21h802m-802 22h802" stroke="#77828a" stroke-width="1" opacity=".45"/>
    <g fill="#f2e8d6" filter="url(#ftc-lamp-glow)">${bulbs(475, 510, 1299, 510, 52, 2.7)}${bulbs(1299, 610, 475, 610, 52, 2.7)}</g>
    <path class="scene-bulb-runner scene-bulb-runner-reverse" d="M475 510H1299V610H475Z" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="1 19"/>
    <path d="M465 620h844l-82 94H547Z" fill="url(#ftc-canopy)" stroke="#41454d" stroke-width="4"/>
    <path d="M465 620h844l-9 13H474Z" fill="#a93a35"/>
    <path d="M500 651h774m-758 19h742m-726 19h710" stroke="#8d6e63" stroke-width="1" opacity=".25"/>
    <g fill="#f4dec0" filter="url(#ftc-lamp-glow)">${canopy}</g>
    <path d="M520 706h734v124H520Z" fill="#10151c"/>
    ${Array.from({length:10}, (_,i) => `<g transform="translate(${529+i*72} 714)"><path d="M0 0h66v110H0Z" fill="url(#ftc-door)" stroke="#8d7b6b" stroke-width="2"/><path d="M7 7h22v96H7Zm30 0h22v96H37Z" fill="#0c141b" opacity=".8"/><path d="M33 0v110m-5-50v16m10-16v16" stroke="#a39889" stroke-width="2"/></g>`).join('')}
    <path d="M449 830h876l18 21H431Z" fill="#474a50"/><path d="M437 849h900" stroke="#8f9090" stroke-width="2"/>
  </g>
  <g class="scene-street">
    <path d="M0 837 449 830l-18 21h912l-18-21 449 7v203H0Z" fill="url(#ftc-road)"/>
    <path d="M0 837h1774v203H0Z" fill="url(#ftc-floor)"/>
    <path d="m0 870 449-19h894l431 19M0 904l1774-2" stroke="#84919e" stroke-width="1.5" opacity=".17"/>
    <path d="m190 841-75 199h140l64-199Zm450 16-61 183h170l28-183Zm780-16-39 199h198l-19-199Z" fill="url(#ftc-reflection)" opacity=".3"/>
    <g stroke-linecap="round" opacity=".3"><path d="m143 879 92-7m-137 40 130-11m360 20 102-8m-93 46 153-14m583-88 127-10m-121 53 147-15" stroke="#d3d7dc" stroke-width="3"/><path d="m1075 877 152-16m-174 65 139-17m-101 66 176-21" stroke="#b74a42" stroke-width="4"/></g>
  </g>
  <g class="scene-people">${crowd}${person(159, 835, 1.3, '#292b32')}${person(1565, 833, 1.3, '#504239')}<g class="scene-walker">${person(1358, 846, 1.5, '#6e503c')}${person(1400, 841, 1.3, '#292c34')}</g></g>
  <g class="scene-traffic"><g transform="translate(1670 826) scale(1.12)"><g class="scene-cab-motion">${taxi()}</g></g><g transform="translate(1730 804) scale(.66)"><g class="scene-cab-motion scene-cab-far">${taxi()}</g></g></g>
  </svg>`;
}

export function mountCityScene() {
  const scene = document.querySelector('.city-architecture');
  if (!scene) return;
  const portrait = window.matchMedia('(max-width: 700px)').matches;
  scene.classList.toggle('is-portrait', portrait);
  scene.setAttribute('viewBox', portrait ? '0 0 700 1040' : '0 0 1774 910');
}
