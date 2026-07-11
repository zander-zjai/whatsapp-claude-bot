'use strict';

/**
 * Built-in sign-type presets for Stability AI mockup generation.
 * Each preset describes the visual character of that sign type.
 * The customer's description from WhatsApp is appended after.
 */
const SIGN_PRESETS = [
  {
    id: 'lightbox',
    label: 'Lightbox',
    prompt:
      'Illuminated lightbox sign. Rectangular or square aluminium cabinet with a bright acrylic LED-backlit face. Even, clean internal lighting. Sharp edges and flat face.',
  },
  {
    id: 'fabricated_letters',
    label: 'Fabricated Letters',
    prompt:
      'Three-dimensional fabricated letter signage. Individual shaped letters with visible depth and thickness, made from painted aluminium or Plexiglass acrylic. Cast shadow shows the dimensional form.',
  },
  {
    id: 'neon_led',
    label: 'Neon / LED Flex',
    prompt:
      'LED flex neon-style lettering. Glowing neon-look tube bent into shapes, vibrant colour emission, warm soft glow on the backing board. Photorealistic tube detail.',
  },
  {
    id: 'pvc_banner',
    label: 'PVC Banner',
    prompt:
      'Large-format printed PVC banner. Full-colour graphic printed on smooth white vinyl banner material. Flat, clean, sharp print detail. Grommets visible at edges.',
  },
  {
    id: 'vehicle_wrap',
    label: 'Vehicle Wrap',
    prompt:
      'Vehicle wrap design applied to a clean commercial vehicle. Full-colour printed vinyl conforming to the body panels. Show the complete vehicle with wrap applied.',
  },
];

/**
 * Context options — sets whether the sign appears in isolation or in an environment.
 */
const SIGN_CONTEXTS = [
  {
    id: 'isolated',
    label: 'Isolated',
    prompt:
      'Isolated studio product shot on a plain white or light-grey background. No buildings, no street, no people. The sign fills most of the frame.',
  },
  {
    id: 'building',
    label: 'On Building',
    prompt:
      'Sign installed on a commercial building exterior. Show the storefront or facade with the sign mounted in a realistic position.',
  },
  {
    id: 'vehicle',
    label: 'On Vehicle',
    prompt:
      'Graphic applied to a clean commercial vehicle (van or car) shown in a neutral outdoor setting. Show the full vehicle.',
  },
];

module.exports = { SIGN_PRESETS, SIGN_CONTEXTS };
