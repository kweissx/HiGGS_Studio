// The models shown in the Studio. Each one maps to a Higgsfield API endpoint.
// Settings come from the official docs (docs.higgsfield.ai, checked October 2026).
// To add another model, copy an entry, change `path` and `fields` to match its docs page,
// or use "Any model (advanced)" in the app without editing code.

const ASPECTS_SOUL2 = ['1:1', '9:16', '16:9', '4:3', '3:4', '2:3', '3:2'];
const ASPECTS_SOUL = ['4:3', '1:1', '3:4', '3:2', '2:3', '5:4', '4:5', '16:9', '9:16', '21:9'];
const ASPECTS_GROK = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2'];
const ASPECTS_IDEOGRAM = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '2:1', '1:2', '5:8', '8:5', '3:1', '1:3', '3:8', '8:3', '5:12', '12:5', '9:22', '22:9', '9:23', '23:9'];
const ASPECTS_VIDEO = ['16:9', '9:16', '1:1'];
const ASPECTS_SEEDANCE = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];

const prompt = (required = true) => ({ name: 'prompt', label: 'Prompt', type: 'prompt', required });
const image = (name, label, required = true) => ({ name, label, type: 'image', required });

window.MODELS = [
  // ---------------- Images ----------------
  {
    id: 'soul-2',
    name: 'SOUL V2',
    kind: 'image',
    blurb: 'Portraits, fashion and editorial photos.',
    path: '/higgsfield-ai/soul/v2/standard',
    docs: 'https://docs.higgsfield.ai/docs/models/soul-2/generate',
    fields: [
      prompt(),
      { name: 'aspect_ratio', label: 'Shape', type: 'select', options: ASPECTS_SOUL2, default: '1:1' },
      { name: 'resolution', label: 'Resolution', type: 'select', options: ['720p', '1080p'], default: '720p' },
      { name: 'batch_size', label: 'How many', type: 'select', options: [1, 4], default: 1 },
      { name: 'enhance_prompt', label: 'Improve my prompt automatically', type: 'bool', default: false },
      { name: 'seed', label: 'Seed (optional)', type: 'number', min: 1, max: 1000000, advanced: true },
    ],
  },
  {
    id: 'soul',
    name: 'SOUL',
    kind: 'image',
    blurb: 'The original SOUL photo model, up to 4K.',
    path: '/higgsfield-ai/soul/standard',
    docs: 'https://docs.higgsfield.ai/docs/models/soul-standard/generate',
    fields: [
      prompt(),
      { name: 'aspect_ratio', label: 'Shape', type: 'select', options: ASPECTS_SOUL, default: '4:3' },
      { name: 'resolution', label: 'Resolution', type: 'select', options: ['2K', '4K'], default: '2K' },
      { name: 'num_images', label: 'How many', type: 'select', options: [1, 2, 3, 4], default: 1 },
    ],
  },
  {
    id: 'grok-image-2',
    name: 'Grok Image 2.0',
    kind: 'image',
    blurb: 'Create new images or edit up to 10 of your own.',
    path: '/xai/grok-imagine-image-2.0',
    docs: 'https://docs.higgsfield.ai/docs/models/grok-image-2/generate-and-edit',
    fields: [
      prompt(),
      { name: 'image_urls', label: 'Images to edit (optional)', type: 'images', max: 10 },
      { name: 'aspect_ratio', label: 'Shape', type: 'select', options: ASPECTS_GROK, default: 'auto' },
      { name: 'resolution', label: 'Resolution', type: 'select', options: ['1k', '2k'], default: '1k' },
      { name: 'quality', label: 'Quality', type: 'select', options: ['medium', 'low'], default: 'medium' },
    ],
  },
  {
    id: 'ideogram-4',
    name: 'Ideogram 4.0',
    kind: 'image',
    blurb: 'Great with text, logos and posters.',
    path: '/ideogram/v4.0',
    docs: 'https://docs.higgsfield.ai/docs/models/ideogram-4/generate',
    fields: [
      prompt(),
      { name: 'aspect_ratio', label: 'Shape', type: 'select', options: ASPECTS_IDEOGRAM, default: '1:1' },
      { name: 'rendering_speed', label: 'Speed', type: 'select', options: ['DEFAULT', 'TURBO', 'QUALITY'], default: 'DEFAULT' },
      image('image_url', 'Image to remix (optional)', false),
      { name: 'image_weight', label: 'How much to keep from your image (1-100)', type: 'number', min: 1, max: 100, advanced: true },
    ],
  },

  // ---------------- Videos ----------------
  {
    id: 'genjutsu-motion',
    shapeNote: 'Same shape as your video.',
    name: 'Genjutsu · Motion transfer',
    kind: 'video',
    blurb: 'Copy the movement from a video onto your own character or images.',
    path: '/higgsfield/genjutsu/motion-transfer/v1.0',
    docs: 'https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer',
    fields: [
      { name: 'video_url', label: 'Video with the motion (4 to 30 seconds)', type: 'video', required: true },
      { name: 'image_urls', label: 'Your character or images (1 to 8)', type: 'images', max: 8, required: true },
      prompt(false),
      { name: 'resolution', label: 'Resolution', type: 'select', options: ['480p', '720p', '1080p'], default: '720p' },
    ],
  },
  {
    id: 'genjutsu-swap',
    shapeNote: 'Same shape as your video.',
    name: 'Genjutsu · Object swap',
    kind: 'video',
    blurb: 'Replace an object or person in a video with something from your images.',
    path: '/higgsfield/genjutsu/object-swap/v1.0',
    docs: 'https://docs.higgsfield.ai/docs/models/genjutsu/object-swap',
    fields: [
      { name: 'video_url', label: 'Your video', type: 'video', required: true },
      { name: 'image_urls', label: 'What to swap in (1 to 8 images)', type: 'images', max: 8, required: true },
      { name: 'prompt', label: 'Prompt (optional): say what to replace', type: 'prompt' },
      { name: 'resolution', label: 'Resolution', type: 'select', options: ['480p', '720p', '1080p'], default: '720p' },
    ],
  },
  {
    id: 'genjutsu-restyle',
    shapeNote: 'Same shape as your video.',
    name: 'Genjutsu · Restyle',
    kind: 'video',
    blurb: 'Turn your video into a new look, like anime or claymation.',
    path: '/higgsfield/genjutsu/restyle/v1.0',
    docs: 'https://docs.higgsfield.ai/docs/models/genjutsu/restyle',
    fields: [
      { name: 'video_url', label: 'Your video (4 to 30 seconds)', type: 'video', required: true },
      { name: 'preset_id', label: 'Pick a style', type: 'preset', source: '/models/higgsfield/genjutsu/restyle/v1.0/presets', required: true },
      prompt(false),
      { name: 'image_urls', label: 'Style reference images (optional, up to 5)', type: 'images', max: 5 },
      { name: 'resolution', label: 'Resolution', type: 'select', options: ['480p', '720p', '1080p'], default: '720p' },
    ],
  },
  {
    id: 'kling-3-t2v',
    name: 'Kling 3.0 · Text to video',
    kind: 'video',
    blurb: 'Describe a scene and get a video with sound.',
    path: '/kling-video/v3.0/std/text-to-video',
    docs: 'https://docs.higgsfield.ai/docs/models/kling-3/standard-text-to-video',
    fields: [
      prompt(),
      { name: 'aspect_ratio', label: 'Shape', type: 'select', options: ASPECTS_VIDEO, default: '16:9' },
      { name: 'duration', label: 'Length (seconds)', type: 'number', min: 3, max: 15, default: 5 },
      { name: 'sound', label: 'Sound', type: 'select', options: ['on', 'off'], default: 'on' },
    ],
  },
  {
    id: 'kling-3-i2v',
    shapeNote: 'Same shape as your start image.',
    name: 'Kling 3.0 · Image to video',
    kind: 'video',
    blurb: 'Bring one of your images to life.',
    path: '/kling-video/v3.0/std/image-to-video',
    docs: 'https://docs.higgsfield.ai/docs/models/kling-3/standard-image-to-video',
    fields: [
      image('image_url', 'Start image'),
      prompt(false),
      image('last_image_url', 'End image (optional)', false),
      { name: 'duration', label: 'Length (seconds)', type: 'number', min: 3, max: 15, default: 5 },
      { name: 'sound', label: 'Sound', type: 'select', options: ['on', 'off'], default: 'on' },
    ],
  },
  {
    id: 'seedance-2-t2v',
    name: 'Seedance 2.0 · Text to video',
    kind: 'video',
    blurb: 'Cinematic video up to 4K, with audio.',
    path: '/bytedance/seedance-2.0/text-to-video',
    docs: 'https://docs.higgsfield.ai/docs/models/seedance-2/text-to-video',
    fields: [
      prompt(),
      { name: 'aspect_ratio', label: 'Shape', type: 'select', options: ASPECTS_SEEDANCE, default: '16:9' },
      { name: 'resolution', label: 'Resolution', type: 'select', options: ['480p', '720p', '1080p', '4k'], default: '720p' },
      { name: 'duration', label: 'Length (seconds)', type: 'number', min: 4, max: 15, default: 5 },
      { name: 'generate_audio', label: 'Add audio', type: 'bool', default: true },
    ],
  },
  {
    id: 'seedance-2-i2v',
    shapeNote: 'Same shape as your start image.',
    name: 'Seedance 2.0 · Image to video',
    kind: 'video',
    blurb: 'Animate an image, optionally ending on a second image.',
    path: '/bytedance/seedance-2.0/image-to-video',
    docs: 'https://docs.higgsfield.ai/docs/models/seedance-2/image-to-video',
    fields: [
      image('image_url', 'Start image'),
      prompt(false),
      image('end_image_url', 'End image (optional)', false),
      { name: 'resolution', label: 'Resolution', type: 'select', options: ['480p', '720p', '1080p', '4k'], default: '720p' },
      { name: 'duration', label: 'Length (seconds)', type: 'number', min: 4, max: 15, default: 5 },
      { name: 'generate_audio', label: 'Add audio', type: 'bool', default: true },
    ],
  },
  {
    id: 'wan-2-6-i2v',
    shapeNote: 'Same shape as your start image.',
    name: 'Wan 2.6 · Image to video',
    kind: 'video',
    blurb: 'Animate an image, up to 15 seconds.',
    path: '/wan/v2.6/image-to-video',
    docs: 'https://docs.higgsfield.ai/docs/models/wan-2-6/image-to-video',
    fields: [
      image('image_url', 'Start image'),
      prompt(),
      { name: 'resolution', label: 'Resolution', type: 'select', options: ['480p', '720p', '1080p'], default: '720p' },
      { name: 'duration', label: 'Length (seconds)', type: 'select', options: [5, 10, 15], default: 5 },
      { name: 'prompt_extend', label: 'Improve my prompt automatically', type: 'bool', default: false },
      { name: 'negative_prompt', label: 'Things to avoid (optional)', type: 'text', advanced: true },
    ],
  },
  {
    id: 'kling-25-t2v',
    shapeNote: "This model doesn't let you choose the shape.",
    name: 'Kling 2.5 Turbo Pro · Text to video',
    kind: 'video',
    blurb: 'Fast, lower-cost text to video.',
    path: '/kling-video/v2.5-turbo/pro/text-to-video',
    docs: 'https://docs.higgsfield.ai/docs/models/kling-2-5-turbo',
    fields: [
      prompt(),
      { name: 'duration', label: 'Length (seconds)', type: 'select', options: [5, 10], default: 5 },
      { name: 'negative_prompt', label: 'Things to avoid (optional)', type: 'text', advanced: true },
    ],
  },
  {
    id: 'kling-25-i2v',
    shapeNote: 'Same shape as your start image.',
    name: 'Kling 2.5 Turbo Pro · Image to video',
    kind: 'video',
    blurb: 'Fast, lower-cost image to video.',
    path: '/kling-video/v2.5-turbo/pro/image-to-video',
    docs: 'https://docs.higgsfield.ai/docs/models/kling-2-5-turbo',
    fields: [
      image('image_url', 'Start image'),
      prompt(),
      { name: 'duration', label: 'Length (seconds)', type: 'select', options: [5, 10], default: 5 },
      { name: 'negative_prompt', label: 'Things to avoid (optional)', type: 'text', advanced: true },
    ],
  },
  {
    id: 'hailuo-23-t2v',
    shapeNote: "This model doesn't let you choose the shape.",
    name: 'Hailuo 2.3 · Text to video',
    kind: 'video',
    blurb: 'MiniMax Hailuo, 6 or 10 seconds.',
    path: '/minimax/hailuo-2.3/standard/text-to-video',
    docs: 'https://docs.higgsfield.ai/docs/models/hailuo-2-3',
    fields: [
      prompt(),
      { name: 'duration', label: 'Length (seconds)', type: 'select', options: [6, 10], default: 6 },
      { name: 'prompt_optimizer', label: 'Improve my prompt automatically', type: 'bool', default: true },
    ],
  },
  {
    id: 'hailuo-23-i2v',
    shapeNote: 'Same shape as your start image.',
    name: 'Hailuo 2.3 · Image to video',
    kind: 'video',
    blurb: 'MiniMax Hailuo from a start image.',
    path: '/minimax/hailuo-2.3/standard/image-to-video',
    docs: 'https://docs.higgsfield.ai/docs/models/hailuo-2-3',
    fields: [
      image('image_url', 'Start image'),
      prompt(),
      { name: 'duration', label: 'Length (seconds)', type: 'select', options: [6, 10], default: 6 },
      { name: 'prompt_optimizer', label: 'Improve my prompt automatically', type: 'bool', default: true },
    ],
  },

  // ---------------- Anything else ----------------
  {
    id: 'custom',
    name: 'Any model (advanced)',
    kind: 'custom',
    blurb: 'Use any of the 80+ Higgsfield models: copy the endpoint and settings from its docs page.',
    docs: 'https://docs.higgsfield.ai/docs/models',
    custom: true,
  },
];
