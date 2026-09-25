// Shared world-space layout used by perception, physics, navigation and rendering.
const center=Object.freeze({x:-11.45,y:1,z:0});
export const PRINTER=Object.freeze({
  center,position:center,rotationY:Math.PI/2,rotation:Math.PI/2,
  approach:Object.freeze({x:-8.75,y:1,z:0}),heading:-Math.PI/2,
  keyboard:Object.freeze({x:-9.55,y:1.35,z:0}),
  output:Object.freeze({x:-7.5,z:1.2}),
});
export const GARDEN_BOUNDS=Object.freeze({x:13,z:12});
