// The clickable body diagram. Organs are tagged with their system and shaded by mastery.
import type { SystemId } from './content.js';

export type Level = 'none' | 'low' | 'mid' | 'high';

export function level(percent: number | null): Level {
  if (percent === null) return 'none';
  if (percent < 60) return 'low';
  if (percent < 75) return 'mid';
  return 'high';
}

interface Organ {
  system: SystemId;
  label: string;
  shape: string; // SVG element markup without the closing part
}

// viewBox 0 0 240 440, viewer's left is the patient's right.
const ORGANS: Organ[] = [
  { system: 'neuro', label: 'Brain', shape: '<ellipse cx="120" cy="38" rx="20" ry="17"' },
  { system: 'endo', label: 'Thyroid', shape: '<path d="M110 86 Q110 80 116 81 L120 84 L124 81 Q130 80 130 86 Q130 92 124 91 L120 88 L116 91 Q110 92 110 86 Z"' },
  { system: 'pulm', label: 'Right lung', shape: '<path d="M100 100 Q84 104 80 128 Q78 152 84 164 Q96 166 108 158 L110 108 Q108 100 100 100 Z"' },
  { system: 'pulm', label: 'Left lung', shape: '<path d="M140 100 Q156 104 160 128 Q162 152 156 164 Q146 166 138 160 L130 108 Q132 100 140 100 Z"' },
  { system: 'cardio', label: 'Heart', shape: '<path d="M126 162 C108 150 106 132 116 128 C122 126 126 131 126 135 C126 131 130 126 136 128 C146 132 144 150 126 162 Z"' },
  { system: 'gi', label: 'Liver', shape: '<path d="M80 172 Q98 164 130 170 Q126 188 104 192 Q84 192 80 172 Z"' },
  { system: 'gi', label: 'Stomach', shape: '<path d="M134 172 Q150 166 158 178 Q160 192 146 194 Q136 190 134 182 Z"' },
  { system: 'heme', label: 'Spleen', shape: '<ellipse cx="166" cy="176" rx="6" ry="11"' },
  { system: 'gi', label: 'Intestines', shape: '<rect x="96" y="200" width="48" height="48" rx="14"' },
  { system: 'renal', label: 'Right kidney', shape: '<ellipse cx="84" cy="214" rx="8" ry="13"' },
  { system: 'renal', label: 'Left kidney', shape: '<ellipse cx="156" cy="214" rx="8" ry="13"' },
  { system: 'renal', label: 'Bladder', shape: '<ellipse cx="120" cy="260" rx="11" ry="8"' },
  { system: 'rheum', label: 'Right elbow', shape: '<circle cx="47" cy="190" r="8"' },
  { system: 'rheum', label: 'Left elbow', shape: '<circle cx="193" cy="190" r="8"' },
  { system: 'rheum', label: 'Right knee', shape: '<circle cx="93" cy="350" r="10"' },
  { system: 'rheum', label: 'Left knee', shape: '<circle cx="147" cy="350" r="10"' },
  { system: 'heme', label: 'Bone marrow (femur)', shape: '<rect x="146" y="290" width="6" height="44" rx="3"' },
];

const SILHOUETTE = `
  <g class="body-shape">
    <ellipse cx="120" cy="46" rx="28" ry="32"/>
    <rect x="108" y="72" width="24" height="22" rx="6"/>
    <path d="M74 92 Q120 82 166 92 Q178 96 178 110 L172 200 Q170 250 158 274 L82 274 Q70 250 68 200 L62 110 Q62 96 74 92 Z"/>
    <path class="limb" d="M70 102 L47 190 L40 264"/>
    <path class="limb" d="M170 102 L193 190 L200 264"/>
    <path class="limb leg" d="M98 268 L93 350 L91 424"/>
    <path class="limb leg" d="M142 268 L147 350 L149 424"/>
  </g>`;

/**
 * @param levels mastery level per system
 * @param names  system display names, for tooltips and screen readers
 */
export function bodySvg(levels: Record<SystemId, Level>, names: Record<SystemId, string>): string {
  const organs = ORGANS.map((o) => `${o.shape} class="organ lvl-${levels[o.system]}" data-action="open-system" data-id="${o.system}"
      tabindex="0" role="button" aria-label="${o.label}: ${names[o.system]}"><title>${o.label} — ${names[o.system]}</title></${tagOf(o.shape)}>`).join('');
  const id = `<g class="organ-group" data-action="open-system" data-id="id" tabindex="0" role="button" aria-label="${names.id}">
      <title>${names.id} (whole body)</title>
      <circle class="organ lvl-${levels.id}" cx="206" cy="40" r="18"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const r = (deg * Math.PI) / 180;
        return `<line class="germ-spike lvl-${levels.id}" x1="${206 + 18 * Math.cos(r)}" y1="${40 + 18 * Math.sin(r)}" x2="${206 + 24 * Math.cos(r)}" y2="${40 + 24 * Math.sin(r)}"/>`;
      }).join('')}
      <text x="206" y="44" text-anchor="middle" class="germ-label">ID</text>
    </g>`;
  return `<svg class="body-map" viewBox="0 0 240 440" role="group" aria-label="Body systems map">${SILHOUETTE}${organs}${id}</svg>`;
}

function tagOf(shape: string): string {
  return shape.slice(1, shape.indexOf(' '));
}
