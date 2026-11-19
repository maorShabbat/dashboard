// The curated font list: one entry per FAMILY (weights are not separate families). id = Fontsource package id.
// Every family must come from Google Fonts under an OFL / Apache / MIT licence; scripts/fetch-fonts.mjs verifies this per family.
export const CATEGORIES = [
  { id: 'chunky', name: 'Chunky display · round / bubbly' },
  { id: 'arcade', name: 'Arcade / pixel' },
  { id: 'comic', name: 'Comic / cartoon' },
  { id: 'condensed', name: 'Condensed impact' },
  { id: 'rounded', name: 'Rounded / playful' },
  { id: 'fantasy', name: 'Fantasy / Nordic / viking' },
  { id: 'horror', name: 'Horror' },
  { id: 'scifi', name: 'Futuristic / sci-fi' },
  { id: 'western', name: 'Western' },
  { id: 'elegant', name: 'Elegant / cabaret' },
];

export const FONTS = {
  chunky: ['sigmar-one', 'passion-one', 'carter-one', 'rowdies', 'racing-sans-one', 'grandstander', 'lilita-one', 'titan-one', 'chango', 'bowlby-one', 'luckiest-guy', 'modak', 'rubik-bubbles', 'paytone-one', 'coiny', 'dynapuff', 'bagel-fat-one', 'rammetto-one', 'shrikhand', 'lemon', 'climate-crisis', 'bungee'],
  arcade: ['press-start-2p', 'silkscreen', 'vt323', 'pixelify-sans', 'dotgothic16', 'tiny5', 'micro-5', 'workbench', 'sixtyfour', 'handjet', 'rubik-pixels', 'jersey-10', 'rubik-glitch', 'geo'],
  comic: ['chewy', 'bangers', 'comic-neue', 'permanent-marker', 'boogaloo', 'patrick-hand', 'gochi-hand', 'londrina-solid', 'bubblegum-sans', 'mouse-memoirs', 'sedgwick-ave-display', 'knewave', 'caveat-brush', 'fontdiner-swanky', 'slackey'],
  condensed: ['anton', 'bebas-neue', 'oswald', 'league-gothic', 'fjalla-one', 'big-shoulders-display', 'antonio', 'pathway-gothic-one', 'teko', 'six-caps', 'staatliches', 'alumni-sans', 'squada-one'],
  rounded: ['nunito', 'quicksand', 'varela-round', 'comfortaa', 'm-plus-rounded-1c', 'mali', 'itim', 'delius', 'balsamiq-sans', 'playpen-sans', 'baloo-2', 'sniglet', 'fredoka'],
  fantasy: ['cinzel', 'uncial-antiqua', 'almendra', 'metamorphous', 'macondo', 'pirata-one', 'unifrakturcook', 'grenze-gotisch', 'new-rocker', 'medievalsharp', 'jim-nightshade', 'germania-one', 'texturina', 'eagle-lake'],
  horror: ['creepster', 'nosifer', 'eater', 'butcherman', 'metal-mania', 'rubik-wet-paint', 'jolly-lodger', 'frijole', 'special-elite', 'henny-penny', 'griffy', 'kranky'],
  scifi: ['orbitron', 'audiowide', 'exo-2', 'michroma', 'oxanium', 'syncopate', 'zen-dots', 'quantico', 'megrim', 'tektur', 'goldman', 'wallpoet', 'stalinist-one', 'major-mono-display'],
  western: ['rye', 'sancreek', 'ewert', 'smokum', 'holtwood-one-sc', 'diplomata', 'ranchers', 'bevan', 'alfa-slab-one', 'graduate', 'vast-shadow', 'wellfleet'],
  elegant: ['playfair-display', 'abril-fatface', 'cormorant-garamond', 'great-vibes', 'lobster', 'yellowtail', 'parisienne', 'limelight', 'poiret-one', 'bodoni-moda', 'rozha-one', 'gloock', 'pinyon-script'],
};

/** Weights to bundle when 400 and 700 are not what the family is good for (heavy display faces). Default: 400 and 700 where they exist. */
export const WEIGHT_OVERRIDES = { grandstander: [700, 900], rowdies: [400, 700], fredoka: [400, 600, 700], 'baloo-2': [400, 700, 800], 'titan-one': [400], 'paytone-one': [400] };
