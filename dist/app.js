import { generateDataset, fitPCA, projectPoint, reconstructionError } from './pca-math.js';

const $ = id => document.getElementById(id);
const canvas = $('scene-canvas');
const scoreCanvas = $('scores-canvas');
const context = canvas.getContext('2d');
const scoreContext = scoreCanvas.getContext('2d');
const colours = { ink: '#073758', muted: '#6b8391', point: '#168bae', selected: '#db7728', pc: ['#009fd6', '#2c7787', '#8974b5'] };
const stages = [
  { title: 'Inspect the 3D data', instruction: 'Each dot is one observation with three measured values. Rotate the cloud to inspect its shape.', next: 'Next: centre the cloud' },
  { title: 'Centre the cloud', instruction: 'Subtract the mean of each variable. The shape stays the same, and the cloud’s centre moves to zero.', next: 'Next: find the axes' },
  { title: 'Find the principal axes', instruction: 'PC1 follows the greatest spread. PC2 captures the most remaining variance at a right angle to PC1. Together they span the fitted plane.', next: 'Next: project the points' },
  { title: 'Project onto the plane', instruction: 'Keep PC1 and PC2, and discard the PC3 coordinate. Use the slider to see each point’s perpendicular journey to its reconstruction.', next: 'Next: read the scores' },
  { title: 'Read the 2D scores', instruction: 'The two scores are coordinates along the fitted PC1 and PC2 axes. Select a point in either view to find the same observation in the other.', next: 'Restart exploration' },
];

const state = { stage: 1, noise: 0.08, projection: 0, selected: 37, yaw: 0.66, pitch: 0.34, zoom: 1, cameraPreset: '', points: [], model: null, reconstructed: [], drawnPoints: [], scorePoints: [] };
// Dot products resolve each 3D point along the orthographic camera's three axes.
const dot = (a, b) => a.reduce((sum, value, j) => sum + value * b[j], 0);

/** Refit the actual observations whenever the thickness control changes. */
function fitDataset() {
  state.points = generateDataset({ noise: state.noise, seed: 7 });
  state.model = fitPCA(state.points);
  state.reconstructed = state.points.map(point => projectPoint(point, state.model, 2).map((value, j) => value - state.model.mean[j]));
  $('noise-value').value = state.noise.toFixed(2);
  // Each marker uses the cumulative fraction at its component count. The
  // highlighted k=2 marker and the plane summary share the same fitted value.
  const curve = state.model.cumulativeVarianceRatio;
  const labels = curve.map(ratio => (ratio * 100).toFixed(1).replace(/\.0$/, '') + '%');
  const markers = $('variance-markers').children;
  const points = curve.map((ratio, k) => {
    const x = 48 + 109 * k;
    const y = 125 - 98 * ratio;
    markers[k].setAttribute('transform', `translate(${x} ${y})`);
    if (k > 0) markers[k].querySelector('text').textContent = labels[k];
    return `${x},${y}`;
  });
  $('variance-line').setAttribute('points', points.join(' '));
  $('variance-description').textContent = `Variance retained with one, two and three components: ${labels.slice(1).join(', ')}.`;
  $('retained-variance').textContent = labels[2];
  const error = reconstructionError(state.points, state.model, 2);
  $('reconstruction-error').textContent = error < 1e-12 ? '0' : error.toFixed(4);
  updateSelectedDetail();
  render();
}

/** Update the progressive teaching layout without changing the data or camera. */
function setStage(stage) {
  state.stage = stage;
  const copy = stages[stage - 1];
  $('stage-title').textContent = copy.title;
  $('stage-instruction').textContent = copy.instruction;
  $('stage-count').textContent = `Step ${stage} of 5`;
  $('navigation-caption').textContent = `${stage} / 5`;
  $('previous-step').disabled = stage === 1;
  $('next-step').innerHTML = `${copy.next} <span aria-hidden="true">${stage === 5 ? '↺' : '→'}</span>`;
  $('projection-control').hidden = stage !== 4;
  $('pca-summary').hidden = stage < 3;
  $('scores-panel').hidden = stage !== 5;
  $('selected-detail').hidden = stage !== 5;
  $('plot-layout').classList.toggle('show-scores', stage === 5);
  $('scene-label').textContent = stage === 1 ? 'Original variables x₁, x₂, x₃' : 'Centred variables x₁ᶜ, x₂ᶜ, x₃ᶜ';
  $('plane-view').hidden = stage < 3;
  $('edge-view').hidden = stage < 3;
  document.querySelectorAll('[data-stage]').forEach(item => {
    const number = Number(item.dataset.stage);
    item.classList.toggle('complete', number < stage);
    if (number === stage) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  // Canvas CSS dimensions change when the score plot appears; resize next frame.
  requestAnimationFrame(render);
}

/** Show the selected observation's scores and the fitted loading weights. */
function updateSelectedDetail() {
  const scores = state.model.scores[state.selected];
  $('selected-scores').textContent = `Observation ${state.selected + 1}: PC1 = ${scores[0].toFixed(2)}, PC2 = ${scores[1].toFixed(2)}`;
  $('loading-weights').replaceChildren(...state.model.components.slice(0, 2).map((component, pc) => {
    const line = document.createElement('div');
    line.textContent = `PC${pc + 1} score = ${component.map((value, axis) => `${axis > 0 && value >= 0 ? '+ ' : ''}${value.toFixed(3)} × x${['₁', '₂', '₃'][axis]}ᶜ`).join(' ')}`;
    return line;
  }));
}

/** Match the drawing buffer to CSS size while keeping drawing units in CSS pixels. */
function prepareCanvas(element, ctx) {
  const { width, height } = element.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { width, height };
}

/** Draw a line in projected coordinates, with optional dash pattern. */
function drawLine(ctx, first, second, colour, width = 1, dash = []) {
  ctx.beginPath(); ctx.moveTo(first.x, first.y); ctx.lineTo(second.x, second.y);
  ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
}

/** Render an orthographic camera, fitted PCA plane, and depth-sorted observations. */
function render() {
  if (!state.model) return;
  const { width, height } = prepareCanvas(canvas, context);
  if (!width || !height) return;
  const centered = state.stage >= 2;
  const target = centered ? [0, 0, 0] : state.model.mean.map(value => value * 0.70);
  const basePoints = centered ? state.model.centered : state.points;
  // Orthographic camera axes are independent of the fitted PCA loading vectors.
  // Changing yaw/pitch changes only this basis, never the observations or scores.
  const right = [Math.cos(state.yaw), 0, -Math.sin(state.yaw)];
  const forward = [Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(state.pitch), Math.cos(state.yaw) * Math.cos(state.pitch)];
  const up = [-Math.sin(state.yaw) * Math.sin(state.pitch), Math.cos(state.pitch), -Math.cos(state.yaw) * Math.sin(state.pitch)];
  const radius = Math.max(...basePoints.map(point => Math.hypot(...point.map((value, j) => value - target[j]))));
  const scale = Math.min(width, height) / (2.4 * Math.max(radius, 1)) * state.zoom;
  const project = point => {
    const relative = point.map((value, j) => value - target[j]);
    return { x: width / 2 + scale * dot(relative, right), y: height / 2 - scale * dot(relative, up), z: dot(relative, forward) };
  };
  const extent1 = Math.max(...state.model.scores.map(point => Math.abs(point[0]))) * 1.05;
  const extent2 = Math.max(...state.model.scores.map(point => Math.abs(point[1]))) * 1.1;

  if (state.stage >= 3) {
    // The plane uses the fitted PC1/PC2 vectors. A constant PC3 score of zero
    // makes every corner an actual rank-two reconstruction in centred space.
    const corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => project(state.model.components[0].map((value,j) => a*extent1*value + b*extent2*state.model.components[1][j])));
    context.beginPath(); corners.forEach((point, j) => j ? context.lineTo(point.x,point.y) : context.moveTo(point.x,point.y)); context.closePath();
    context.fillStyle = '#009fd613'; context.fill(); context.strokeStyle = '#009fd646'; context.lineWidth = 1; context.stroke();
    for (const fraction of [-0.5, 0, 0.5]) {
      const along1 = [-1,1].map(end => project(state.model.components[0].map((value,j) => fraction*extent1*value + end*extent2*state.model.components[1][j])));
      const along2 = [-1,1].map(end => project(state.model.components[0].map((value,j) => end*extent1*value + fraction*extent2*state.model.components[1][j])));
      drawLine(context, ...along1, '#009fd61d'); drawLine(context, ...along2, '#009fd61d');
    }
  }

  const origin = project([0,0,0]);
  const variableLength = centered ? 3.2 : 6;
  for (let axis = 0; axis < 3; axis += 1) {
    const vector = [0,0,0]; vector[axis] = variableLength;
    const end = project(vector);
    drawLine(context, origin, end, '#8da1ad70', 1);
    context.font = '13px system-ui, sans-serif'; context.fillStyle = '#718795'; context.textAlign = 'center';
    context.fillText(`${['x₁','x₂','x₃'][axis]}${centered ? 'ᶜ' : ''}`, end.x, end.y - 10);
  }
  if (state.stage >= 3) {
    state.model.components.forEach((component, axis) => {
      const length = axis === 0 ? extent1 : axis === 1 ? extent2 : 2.1;
      const start = project(component.map(value => -value * length));
      const end = project(component.map(value => value * length));
      drawLine(context, start, end, `${colours.pc[axis]}a8`, axis === 2 ? 1.6 : 2.0, axis === 2 ? [5,4] : []);
      context.font = '600 14px system-ui, sans-serif'; context.fillStyle = colours.pc[axis]; context.textAlign = 'center'; context.fillText(`PC${axis+1}`, end.x, end.y - 11);
    });
  }

  const amount = state.stage === 5 ? 1 : state.stage === 4 ? state.projection : 0;
  if (state.stage >= 4) {
    state.model.centered.forEach((point, index) => {
      drawLine(context, project(point), project(state.reconstructed[index]), index === state.selected ? '#db7728a8' : '#8b9daa45', index === state.selected ? 1.7 : 0.75);
    });
  }
  state.drawnPoints = basePoints.map((point,index) => {
    const position = amount ? point.map((value,j) => value + amount * (state.reconstructed[index][j] - value)) : point;
    return { ...project(position), index };
  });
  // Larger depth values lie closer to the viewer. Paint far points first.
  const sorted = state.drawnPoints.slice().sort((a,b) => a.z-b.z);
  for (const point of sorted) {
    const selected = point.index === state.selected;
    context.beginPath(); context.arc(point.x,point.y,selected ? 5.4 : 3.0,0,Math.PI*2);
    context.fillStyle = selected ? colours.selected : '#168baeae'; context.fill();
    if (selected) { context.strokeStyle = 'white'; context.lineWidth = 2; context.stroke(); }
  }
  const selected = state.drawnPoints[state.selected];
  // A ring remains visible even if another observation overlaps the chosen point.
  context.beginPath(); context.arc(selected.x,selected.y,8,0,Math.PI*2); context.strokeStyle = '#db7728cc'; context.lineWidth=1.3;context.stroke();
  context.font='12px system-ui, sans-serif';context.fillStyle=colours.selected;context.textAlign='left';
  context.fillText(`Observation ${state.selected+1}`,Math.min(selected.x+13,width-110),Math.max(selected.y-12,18));
  if (centered) {
    context.beginPath(); context.arc(origin.x,origin.y,2.5,0,Math.PI*2);context.fillStyle=colours.ink;context.fill();
    context.font='11px system-ui, sans-serif';context.fillStyle=colours.muted;context.fillText('Mean = 0',origin.x+7,origin.y+17);
  }
  if (state.stage === 5) drawScores();
}

/** Render PC scores with equal scale on both axes and a linked selected point. */
function drawScores() {
  const { width, height } = prepareCanvas(scoreCanvas, scoreContext);
  const max1 = Math.max(...state.model.scores.map(point => Math.abs(point[0]))) * 1.13;
  const max2 = Math.max(...state.model.scores.map(point => Math.abs(point[1]))) * 1.2;
  const scale = Math.min((width-64)/(2*max1),(height-76)/(2*max2));
  const center = { x: width/2, y: height/2 };
  drawLine(scoreContext,{x:32,y:center.y},{x:width-20,y:center.y},'#8da1ad90');
  drawLine(scoreContext,{x:center.x,y:height-36},{x:center.x,y:24},'#8da1ad90');
  scoreContext.font='600 13px system-ui, sans-serif';scoreContext.fillStyle=colours.pc[0];scoreContext.textAlign='right';scoreContext.fillText('PC1',width-16,center.y-9);
  scoreContext.fillStyle=colours.pc[1];scoreContext.textAlign='left';scoreContext.fillText('PC2',center.x+8,25);
  scoreContext.font='11px system-ui, sans-serif';scoreContext.fillStyle=colours.muted;scoreContext.fillText('0',center.x+6,center.y+15);
  state.scorePoints=state.model.scores.map((point,index)=>({x:center.x+point[0]*scale,y:center.y-point[1]*scale,index}));
  for (const point of state.scorePoints) {
    scoreContext.beginPath();scoreContext.arc(point.x,point.y,point.index===state.selected?5.4:3,0,Math.PI*2);scoreContext.fillStyle=point.index===state.selected?colours.selected:'#168baeae';scoreContext.fill();
  }
  const point=state.scorePoints[state.selected];
  drawLine(scoreContext,point,{x:point.x,y:center.y},'#db772887',1,[3,3]);
  drawLine(scoreContext,point,{x:center.x,y:point.y},'#db772887',1,[3,3]);
  scoreContext.beginPath();scoreContext.arc(point.x,point.y,8,0,Math.PI*2);scoreContext.strokeStyle=colours.selected;scoreContext.lineWidth=1.3;scoreContext.stroke();
}

/** Align the view direction to an actual fitted PC; this never projects the data. */
function setCamera(direction, preset) {
  state.yaw = Math.atan2(direction[0],direction[2]);
  state.pitch = Math.asin(Math.max(-1,Math.min(1,direction[1])));
  state.cameraPreset = preset;
  $('plane-view').classList.toggle('active',preset==='plane');
  $('edge-view').classList.toggle('active',preset==='edge');
  render();
}

$('next-step').addEventListener('click',()=>setStage(state.stage===5?1:state.stage+1));
$('previous-step').addEventListener('click',()=>setStage(Math.max(1,state.stage-1)));
$('noise').addEventListener('input',event=>{state.noise=Number(event.target.value);fitDataset();if(state.cameraPreset) setCamera(state.model.components[state.cameraPreset==='plane'?2:0],state.cameraPreset);});
$('projection').addEventListener('input',event=>{state.projection=Number(event.target.value);$('projection-value').value=`${Math.round(state.projection*100)}%`;render();});
$('plane-view').addEventListener('click',()=>setCamera(state.model.components[2],'plane'));
$('edge-view').addEventListener('click',()=>setCamera(state.model.components[0],'edge'));
$('reset-view').addEventListener('click',()=>{state.zoom=1;state.yaw=.66;state.pitch=.34;state.cameraPreset='';$('plane-view').classList.remove('active');$('edge-view').classList.remove('active');render();});

let drag = null;
canvas.addEventListener('pointerdown',event=>{canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);drag={x:event.clientX,y:event.clientY,moved:0};canvas.classList.add('dragging');});
canvas.addEventListener('pointermove',event=>{
  if(!drag)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  drag.moved+=Math.abs(dx)+Math.abs(dy);drag.x=event.clientX;drag.y=event.clientY;
  state.yaw-=dx*.007;state.pitch=Math.max(-1.48,Math.min(1.48,state.pitch+dy*.007));state.cameraPreset='';
  $('plane-view').classList.remove('active');$('edge-view').classList.remove('active');render();
});
canvas.addEventListener('pointerup',event=>{
  if(drag&&drag.moved<5){const rect=canvas.getBoundingClientRect();selectNearest(state.drawnPoints,event.clientX-rect.left,event.clientY-rect.top);}
  drag=null;canvas.classList.remove('dragging');
});
canvas.addEventListener('pointercancel',()=>{drag=null;canvas.classList.remove('dragging');});
canvas.addEventListener('wheel',event=>{event.preventDefault();state.zoom=Math.max(.55,Math.min(2.4,state.zoom*Math.exp(-event.deltaY*.001)));render();},{passive:false});
canvas.addEventListener('keydown',event=>{
  const actions={ArrowLeft:()=>state.yaw+=.1,ArrowRight:()=>state.yaw-=.1,ArrowUp:()=>state.pitch=Math.min(1.48,state.pitch+.1),ArrowDown:()=>state.pitch=Math.max(-1.48,state.pitch-.1),'+':()=>state.zoom=Math.min(2.4,state.zoom*1.1),'=':()=>state.zoom=Math.min(2.4,state.zoom*1.1),'-':()=>state.zoom=Math.max(.55,state.zoom/1.1)};
  if(actions[event.key]){event.preventDefault();actions[event.key]();state.cameraPreset='';$('plane-view').classList.remove('active');$('edge-view').classList.remove('active');render();}
});

/** Select a nearby observation in either view; leave distant blank clicks alone. */
function selectNearest(points,x,y) {
  let best=null,distance=18;
  for(const point of points){const candidate=Math.hypot(point.x-x,point.y-y);if(candidate<distance){distance=candidate;best=point;}}
  if(best){state.selected=best.index;updateSelectedDetail();render();}
}
scoreCanvas.addEventListener('click',event=>{const rect=scoreCanvas.getBoundingClientRect();selectNearest(state.scorePoints,event.clientX-rect.left,event.clientY-rect.top);});
new ResizeObserver(render).observe($('plot-layout'));
fitDataset();
// A direct chart link opens the first lesson stage where the fitted curve is visible.
const previewVariance = location.hash === '#variance-curve';
setStage(previewVariance ? 3 : 1);
if (previewVariance) requestAnimationFrame(() => $('variance-curve').scrollIntoView({ block: 'center' }));
