import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitPCA,
  generateDataset,
  projectPoint,
  reconstructionError,
} from '../dist/pca-math.js';

const EPSILON = 1e-10;
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

/** Compare numbers with a tolerance appropriate to these small synthetic datasets. */
function close(actual, expected, tolerance = EPSILON) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

/** Rotate a vector without changing Euclidean distances or variance. */
function rotate([x, y, z]) {
  const a = 0.63;
  const b = -0.41;
  const q = [Math.cos(a) * x - Math.sin(a) * y,
    Math.sin(a) * x + Math.cos(a) * y, z];
  return [q[0], Math.cos(b) * q[1] - Math.sin(b) * q[2],
    Math.sin(b) * q[1] + Math.cos(b) * q[2]];
}

test('a translated and tilted exact plane has two nonzero PCs and reconstructs exactly', () => {
  const points = [[-3, -1, 0], [-3, 1, 0], [3, -1, 0], [3, 1, 0]]
    .map(rotate).map(point => point.map((value, index) => value + [3, 2, 4][index]));
  const model = fitPCA(points);
  model.mean.forEach((value, index) => close(value, [3, 2, 4][index]));
  close(model.eigenvalues[0], 12);
  close(model.eigenvalues[1], 4 / 3);
  close(model.eigenvalues[2], 0);
  close(model.explainedVarianceRatio[0] + model.explainedVarianceRatio[1], 1);
  close(reconstructionError(points, model, 2), 0);
  points.forEach(point => projectPoint(point, model, 2)
    .forEach((value, index) => close(value, point[index])));
});

test('components are orthonormal covariance eigenvectors, sorted by variance', () => {
  const points = generateDataset({ noise: 0.35, curvature: 0.2, seed: 11 });
  const model = fitPCA(points);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) close(dot(model.components[i], model.components[j]), i === j ? 1 : 0);
    const product = model.covariance.map(row => dot(row, model.components[i]));
    product.forEach((value, j) => close(value, model.eigenvalues[i] * model.components[i][j], 1e-9));
  }
  assert.ok(model.eigenvalues[0] >= model.eigenvalues[1]);
  assert.ok(model.eigenvalues[1] >= model.eigenvalues[2]);
  close(model.explainedVarianceRatio.reduce((sum, value) => sum + value, 0), 1);
  for (let j = 0; j < 3; j += 1) close(model.centered.reduce((sum, point) => sum + point[j], 0), 0, 1e-9);
});

test('mean squared reconstruction error equals dropped sample variance times (n-1)/n', () => {
  const points = generateDataset({ noise: 0.4, seed: 8 });
  const model = fitPCA(points);
  for (const k of [0, 1, 2, 3]) {
    const dropped = model.eigenvalues.slice(k).reduce((sum, value) => sum + value, 0);
    close(reconstructionError(points, model, k), dropped * (points.length - 1) / points.length, 1e-9);
  }
});

test('translation and rigid rotation preserve explained variance and reconstruction error', () => {
  const points = generateDataset({ noise: 0.15, seed: 4 });
  const transformed = points.map(rotate).map(point => point.map((value, index) => value + [7, -4, 9][index]));
  const originalModel = fitPCA(points);
  const transformedModel = fitPCA(transformed);
  originalModel.eigenvalues.forEach((value, index) => close(value, transformedModel.eigenvalues[index], 1e-9));
  close(reconstructionError(points, originalModel, 2), reconstructionError(transformed, transformedModel, 2));
});

test('generated points are deterministic, finite, and exactly planar when noise and curvature are zero', () => {
  const points = generateDataset({ noise: 0, curvature: 0, seed: 7 });
  assert.deepEqual(points, generateDataset({ noise: 0, curvature: 0, seed: 7 }));
  assert.ok(points.length >= 100 && points.length <= 250);
  assert.ok(points.every(point => point.length === 3 && point.every(Number.isFinite)));
  const model = fitPCA(points);
  assert.ok(model.mean.some(value => Math.abs(value) > 1));
  close(model.eigenvalues[2], 0, 1e-12);
  close(reconstructionError(points, model, 2), 0, 1e-12);
});

test('zero-variance and isotropic data stay finite with valid orthonormal axes', () => {
  const zero = fitPCA([[2, 3, 4], [2, 3, 4], [2, 3, 4]]);
  assert.deepEqual(zero.eigenvalues, [0, 0, 0]);
  assert.deepEqual(zero.explainedVarianceRatio, [0, 0, 0]);
  assert.deepEqual(projectPoint([2, 3, 4], zero, 2), [2, 3, 4]);
  const isotropic = fitPCA([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);
  isotropic.eigenvalues.forEach(value => close(value, 0.4));
  isotropic.explainedVarianceRatio.forEach(value => close(value, 1 / 3));
});

test('invalid observations and component counts are rejected', () => {
  assert.throws(() => fitPCA([]), /at least two/i);
  assert.throws(() => fitPCA([[1, 2, 3], [1, NaN, 3]]), /finite/i);
  const model = fitPCA([[0, 0, 0], [1, 1, 1]]);
  assert.throws(() => projectPoint([1, 2, 3], model, 4), /component/i);
});

test('retained variance accumulates by component count, including a zero baseline', () => {
  // Independent axis pairs give variance in the exact proportions 9:4:1.
  const points = [[3,0,0], [-3,0,0], [0,2,0], [0,-2,0], [0,0,1], [0,0,-1]];
  const expected = [0, 9 / 14, 13 / 14, 1];
  const curve = fitPCA(points).cumulativeVarianceRatio;
  assert.equal(curve.length, expected.length);
  expected.forEach((ratio, k) => close(curve[k], ratio));
  assert.deepEqual(fitPCA([[1,1,1], [1,1,1]]).cumulativeVarianceRatio, [0,0,0,0]);
});
