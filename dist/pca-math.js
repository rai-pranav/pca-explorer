/** Numerical PCA for the three-variable teaching example. No rendering dependencies. */

/** Generate a reproducible, tilted two-dimensional cloud with optional normal variation.
 * Noise adds independent thickness. Curvature bends the latent sheet in its normal
 * direction; neither option changes the sample count or random sample identities.
 */
export function generateDataset({ noise = 0.08, curvature = 0, seed = 7 } = {}) {
  if (!Number.isFinite(noise) || noise < 0 || !Number.isFinite(curvature)
      || !Number.isFinite(seed)) {
    throw new TypeError('Noise must be nonnegative and all dataset parameters must be finite.');
  }
  let state = (seed >>> 0) || 1;
  // A local generator keeps this sample independent of browser Math.random state.
  const uniform = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());

  const latent = Array.from({ length: 180 }, () => {
    const a = 2.3 * normal();
    const b = 1.05 * normal();
    return [a, b, noise * normal() + 0.35 * curvature * a * a];
  });
  const latentMean = [0, 1, 2].map(axis =>
    latent.reduce((sum, point) => sum + point[axis], 0) / latent.length);
  // These orthonormal vectors set the synthetic sheet's orientation only.
  // fitPCA still estimates its own axes from the generated observations.
  const basis = [
    [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0],
    [-1 / Math.sqrt(6), 1 / Math.sqrt(6), 2 / Math.sqrt(6)],
    [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)],
  ];
  const offset = [3, 2, 4];
  return latent.map(point => offset.map((value, axis) => value
    + point.reduce((sum, coordinate, j) =>
      sum + (coordinate - latentMean[j]) * basis[j][axis], 0)));
}

/** Diagonalize a real symmetric 3×3 matrix using Jacobi plane rotations.
 * Each rotation removes the largest off-diagonal entry and accumulates the
 * corresponding orthogonal basis change in the eigenvector columns.
 */
function symmetricEigen(matrix) {
  const a = matrix.map(row => row.slice());
  const vectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const scale = Math.max(...a.flat().map(Math.abs));
  const tolerance = scale * Number.EPSILON * 32;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    let p = 0;
    let q = 1;
    for (let i = 0; i < 3; i += 1) {
      for (let j = i + 1; j < 3; j += 1) {
        if (Math.abs(a[i][j]) > Math.abs(a[p][q])) [p, q] = [i, j];
      }
    }
    if (Math.abs(a[p][q]) <= tolerance) break;
    const tau = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.hypot(1, tau));
    const c = 1 / Math.hypot(1, t);
    const s = t * c;
    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    a[p][p] = app - t * apq;
    a[q][q] = aqq + t * apq;
    a[p][q] = a[q][p] = 0;
    for (let k = 0; k < 3; k += 1) {
      if (k !== p && k !== q) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = a[p][k] = c * akp - s * akq;
        a[k][q] = a[q][k] = s * akp + c * akq;
      }
      const vkp = vectors[k][p];
      const vkq = vectors[k][q];
      vectors[k][p] = c * vkp - s * vkq;
      vectors[k][q] = s * vkp + c * vkq;
    }
  }
  return [0, 1, 2].map(index => {
    const vector = vectors.map(row => row[index]);
    const largest = vector.reduce((best, value, j) =>
      Math.abs(value) > Math.abs(vector[best]) ? j : best, 0);
    // PCA signs are arbitrary. A consistent convention reduces display flips.
    if (vector[largest] < 0) vector.forEach((value, j) => { vector[j] = -value; });
    // Sample covariance is positive semidefinite; clamp negative roundoff at zero.
    return { value: Math.max(0, a[index][index]), vector };
  }).sort((first, second) => second.value - first.value);
}

/** Fit ordinary, mean-centered PCA with sample covariance (denominator n−1).
 * Rows are observations and columns are the three measured variables.
 * The returned components are unit loading vectors, one array per PC.
 * cumulativeVarianceRatio[k] is the fraction retained by the first k components.
 */
export function fitPCA(points) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new TypeError('PCA needs at least two observations.');
  }
  if (!points.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite))) {
    throw new TypeError('Each observation must contain three finite numbers.');
  }
  const mean = [0, 1, 2].map(axis =>
    points.reduce((sum, point) => sum + point[axis], 0) / points.length);
  const centered = points.map(point => point.map((value, axis) => value - mean[axis]));
  const covariance = Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) =>
      centered.reduce((sum, point) => sum + point[i] * point[j], 0) / (points.length - 1)));
  const pairs = symmetricEigen(covariance);
  const eigenvalues = pairs.map(pair => pair.value);
  const components = pairs.map(pair => pair.vector);
  const totalVariance = eigenvalues.reduce((sum, value) => sum + value, 0);
  const explainedVarianceRatio = eigenvalues.map(value => totalVariance > 0 ? value / totalVariance : 0);
  const cumulativeVarianceRatio = [0];
  for (const ratio of explainedVarianceRatio) {
    cumulativeVarianceRatio.push(cumulativeVarianceRatio.at(-1) + ratio);
  }
  const scores = centered.map(point => components.map(component =>
    point.reduce((sum, value, axis) => sum + value * component[axis], 0)));
  return { mean, centered, covariance, components, eigenvalues, explainedVarianceRatio, cumulativeVarianceRatio, scores };
}

/** Reconstruct a point from the first k scores in the original variable coordinates.
 * k=0 returns the mean; k=3 retains all three coordinates up to roundoff.
 */
export function projectPoint(point, model, k = 2) {
  if (!Number.isInteger(k) || k < 0 || k > 3) {
    throw new RangeError('The retained component count must be an integer from 0 to 3.');
  }
  if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) {
    throw new TypeError('Each observation must contain three finite numbers.');
  }
  const centered = point.map((value, axis) => value - model.mean[axis]);
  const reconstructed = model.mean.slice();
  for (let j = 0; j < k; j += 1) {
    const component = model.components[j];
    const score = centered.reduce((sum, value, axis) => sum + value * component[axis], 0);
    for (let axis = 0; axis < 3; axis += 1) reconstructed[axis] += score * component[axis];
  }
  return reconstructed;
}

/** Mean squared Euclidean reconstruction error, rather than root error or per-axis MSE. */
export function reconstructionError(points, model, k = 2) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new TypeError('Reconstruction error needs at least one observation.');
  }
  return points.reduce((sum, point) => {
    const reconstructed = projectPoint(point, model, k);
    return sum + point.reduce((distance, value, axis) =>
      distance + (value - reconstructed[axis]) ** 2, 0);
  }, 0) / points.length;
}
