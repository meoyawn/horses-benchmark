import * as THREE from 'three';

/**
 * Fast AABB-accelerated symmetric 3D Signed Distance Field + Surface Nets mesher
 * with Taubin (lambda-mu) non-shrinking smoothing.
 * Produces clean, quad-dominant, watertight organic meshes with zero sliver triangles.
 */
export class SDFBuilder {
  constructor(boundsMin, boundsMax, voxelSize = 0.014) {
    this.voxelSize = voxelSize;
    this.invVoxel = 1.0 / voxelSize;

    // Force X grid to be centered symmetrically around X = 0
    const maxAbsX = Math.max(Math.abs(boundsMin.x), Math.abs(boundsMax.x));
    this.halfNx = Math.ceil(maxAbsX / voxelSize) + 3;
    this.nx = this.halfNx * 2 + 1; // midX = halfNx corresponds to x = 0.0 exactly
    this.midX = this.halfNx;

    this.minX = -this.halfNx * voxelSize;
    this.minY = boundsMin.y - 3 * voxelSize;
    this.minZ = boundsMin.z - 3 * voxelSize;

    this.ny = Math.ceil((boundsMax.y + 3 * voxelSize - this.minY) / voxelSize) + 1;
    this.nz = Math.ceil((boundsMax.z + 3 * voxelSize - this.minZ) / voxelSize) + 1;

    this.strideY = this.nx;
    this.strideZ = this.nx * this.ny;
    this.totalVoxels = this.nx * this.ny * this.nz;

    this.grid = new Float32Array(this.totalVoxels);
    this.grid.fill(10.0); // Positive = outside
  }

  /**
   * Polynomial smooth minimum (C1 continuous fillet of radius ~k/4).
   */
  static smin(a, b, k) {
    if (k <= 1e-5) return a < b ? a : b;
    const diff = a - b;
    const absDiff = diff < 0 ? -diff : diff;
    if (absDiff >= k) return a < b ? a : b;
    const h = (k - absDiff) / k;
    return (a < b ? a : b) - h * h * k * 0.25;
  }

  /**
   * Smooth subtraction: carves primitive b out of field a with fillet radius k.
   */
  static ssub(a, b, k) {
    // smax(a, -b, k) = -smin(-a, b, k)
    const nb = -b;
    if (k <= 1e-5) return a > nb ? a : nb;
    const diff = a - nb;
    const absDiff = diff < 0 ? -diff : diff;
    if (absDiff >= k) return a > nb ? a : nb;
    const h = (k - absDiff) / k;
    return (a > nb ? a : nb) + h * h * k * 0.25;
  }

  /**
   * Adds a tapered elliptical-cross-section capsule from A to B.
   * rxA, rxB: lateral half-widths (along side direction ~X)
   * ryA, ryB: sagittal half-depths (in plane perpendicular to segment & side axis)
   * k: smooth-blend fillet radius
   * mirror: if true, evaluates both +X and -X sides so midline blends organically!
   */
  addLimbSegment(ax, ay, az, bx, by, bz, rxA, ryA, rxB, ryB, k = 0.04, mirror = false) {
    this._rasterizeSegment(ax, ay, az, bx, by, bz, rxA, ryA, rxB, ryB, k, false);
    if (mirror) {
      this._rasterizeSegment(-ax, ay, az, -bx, by, bz, rxA, ryA, rxB, ryB, k, false);
    }
  }

  subLimbSegment(ax, ay, az, bx, by, bz, rxA, ryA, rxB, ryB, k = 0.02, mirror = false) {
    this._rasterizeSegment(ax, ay, az, bx, by, bz, rxA, ryA, rxB, ryB, k, true);
    if (mirror) {
      this._rasterizeSegment(-ax, ay, az, -bx, by, bz, rxA, ryA, rxB, ryB, k, true);
    }
  }

  _rasterizeSegment(ax, ay, az, bx, by, bz, rxA, ryA, rxB, ryB, k, isSubtract) {
    let dx = bx - ax;
    let dy = by - ay;
    let dz = bz - az;
    const lenSq = dx * dx + dy * dy + dz * dz;
    const len = Math.sqrt(lenSq);

    // Orthonormal basis: W along segment, U lateral, V sagittal
    let wx = 0, wy = 0, wz = 1;
    if (len > 1e-5) {
      const invLen = 1.0 / len;
      wx = dx * invLen;
      wy = dy * invLen;
      wz = dz * invLen;
    }

    // Reference side vector (1, 0, 0), fallback to (0, 0, 1) if segment is nearly along X
    let refX = 1, refY = 0, refZ = 0;
    if (Math.abs(wx) > 0.92) {
      refX = 0; refY = 0; refZ = 1;
    }
    // V = normalize(W x ref)
    let vx = wy * refZ - wz * refY;
    let vy = wz * refX - wx * refZ;
    let vz = wx * refY - wy * refX;
    const vLen = Math.hypot(vx, vy, vz) || 1;
    vx /= vLen; vy /= vLen; vz /= vLen;

    // U = V x W (close to +X lateral)
    const ux = vy * wz - vz * wy;
    const uy = vz * wx - vx * wz;
    const uz = vx * wy - vy * wx;

    const maxR = Math.max(rxA, ryA, rxB, ryB);
    const pad = maxR + k + this.voxelSize * 3.0;

    const minPx = Math.min(ax, bx) - pad;
    const maxPx = Math.max(ax, bx) + pad;
    const minPy = Math.min(ay, by) - pad;
    const maxPy = Math.max(ay, by) + pad;
    const minPz = Math.min(az, bz) - pad;
    const maxPz = Math.max(az, bz) + pad;

    // Only evaluate x >= 0 half-space (ix >= midX), then mirror scalar field before meshing!
    const ix0 = Math.max(this.midX, Math.floor((minPx - this.minX) * this.invVoxel));
    const ix1 = Math.min(this.nx - 1, Math.ceil((maxPx - this.minX) * this.invVoxel));
    if (ix0 > ix1) return;

    const iy0 = Math.max(0, Math.floor((minPy - this.minY) * this.invVoxel));
    const iy1 = Math.min(this.ny - 1, Math.ceil((maxPy - this.minY) * this.invVoxel));
    const iz0 = Math.max(0, Math.floor((minPz - this.minZ) * this.invVoxel));
    const iz1 = Math.min(this.nz - 1, Math.ceil((maxPz - this.minZ) * this.invVoxel));

    const grid = this.grid;
    const hVox = this.voxelSize;
    const invLen = len > 1e-5 ? 1.0 / len : 0.0;

    for (let iz = iz0; iz <= iz1; iz++) {
      const pz = this.minZ + iz * hVox;
      const daz = pz - az;
      const zOffset = iz * this.strideZ;

      for (let iy = iy0; iy <= iy1; iy++) {
        const py = this.minY + iy * hVox;
        const day = py - ay;
        const yzOffset = zOffset + iy * this.strideY;

        for (let ix = ix0; ix <= ix1; ix++) {
          const px = this.minX + ix * hVox;
          const dax = px - ax;

          // Projection along segment [0, 1]
          let t = (dax * wx + day * wy + daz * wz) * invLen;
          if (t < 0.0) t = 0.0;
          else if (t > 1.0) t = 1.0;

          const cx = ax + dx * t;
          const cy = ay + dy * t;
          const cz = az + dz * t;

          const qxWorld = px - cx;
          const qyWorld = py - cy;
          const qzWorld = pz - cz;

          const rx = rxA + (rxB - rxA) * t;
          const ry = ryA + (ryB - ryA) * t;
          const rz = 0.5 * (rx + ry);

          // Local coordinates in (U, V, W)
          const lu = qxWorld * ux + qyWorld * uy + qzWorld * uz;
          const lv = qxWorld * vx + qyWorld * vy + qzWorld * vz;
          const lw = qxWorld * wx + qyWorld * wy + qzWorld * wz;

          // IQ analytical ellipsoid distance approximation
          const invRx = 1.0 / rx;
          const invRy = 1.0 / ry;
          const invRz = 1.0 / rz;

          const nx0 = lu * invRx;
          const ny0 = lv * invRy;
          const nz0 = lw * invRz;
          const k0 = Math.sqrt(nx0 * nx0 + ny0 * ny0 + nz0 * nz0);

          let d;
          if (k0 < 1e-5) {
            d = - Math.min(rx, ry, rz);
          } else {
            const nx1 = nx0 * invRx;
            const ny1 = ny0 * invRy;
            const nz1 = nz0 * invRz;
            const k1 = Math.sqrt(nx1 * nx1 + ny1 * ny1 + nz1 * nz1);
            d = k0 * (k0 - 1.0) / k1;
          }

          const idx = yzOffset + ix;
          if (isSubtract) {
            grid[idx] = SDFBuilder.ssub(grid[idx], d, k);
          } else {
            grid[idx] = SDFBuilder.smin(grid[idx], d, k);
          }
        }
      }
    }
  }

  /**
   * Adds an oriented ellipsoid centered at (cx, cy, cz) with radii (rx, ry, rz)
   * and optional Euler rotation (rotX, rotY, rotZ).
   */
  addEllipsoid(cx, cy, cz, rx, ry, rz, k = 0.04, mirror = false, rotX = 0, rotY = 0, rotZ = 0, isSubtract = false) {
    this._rasterizeEllipsoid(cx, cy, cz, rx, ry, rz, k, rotX, rotY, rotZ, isSubtract);
    if (mirror && Math.abs(cx) > 1e-6) {
      this._rasterizeEllipsoid(-cx, cy, cz, rx, ry, rz, k, rotX, -rotY, -rotZ, isSubtract);
    }
  }

  subEllipsoid(cx, cy, cz, rx, ry, rz, k = 0.02, mirror = false, rotX = 0, rotY = 0, rotZ = 0) {
    this.addEllipsoid(cx, cy, cz, rx, ry, rz, k, mirror, rotX, rotY, rotZ, true);
  }

  _rasterizeEllipsoid(cx, cy, cz, rx, ry, rz, k, rotX, rotY, rotZ, isSubtract) {
    const euler = new THREE.Euler(rotX, rotY, rotZ, 'XYZ');
    const quat = new THREE.Quaternion().setFromEuler(euler).invert();
    const m = new THREE.Matrix4().makeRotationFromQuaternion(quat).elements;

    const maxR = Math.max(rx, ry, rz);
    const pad = maxR + k + this.voxelSize * 3.0;

    const ix0 = Math.max(this.midX, Math.floor((cx - pad - this.minX) * this.invVoxel));
    const ix1 = Math.min(this.nx - 1, Math.ceil((cx + pad - this.minX) * this.invVoxel));
    if (ix0 > ix1) return;

    const iy0 = Math.max(0, Math.floor((cy - pad - this.minY) * this.invVoxel));
    const iy1 = Math.min(this.ny - 1, Math.ceil((cy + pad - this.minY) * this.invVoxel));
    const iz0 = Math.max(0, Math.floor((cz - pad - this.minZ) * this.invVoxel));
    const iz1 = Math.min(this.nz - 1, Math.ceil((cz + pad - this.minZ) * this.invVoxel));

    const grid = this.grid;
    const hVox = this.voxelSize;
    const invRx = 1.0 / rx, invRy = 1.0 / ry, invRz = 1.0 / rz;

    for (let iz = iz0; iz <= iz1; iz++) {
      const dz = this.minZ + iz * hVox - cz;
      const zOffset = iz * this.strideZ;
      for (let iy = iy0; iy <= iy1; iy++) {
        const dy = this.minY + iy * hVox - cy;
        const yzOffset = zOffset + iy * this.strideY;
        for (let ix = ix0; ix <= ix1; ix++) {
          const dx = this.minX + ix * hVox - cx;

          const lx = m[0] * dx + m[4] * dy + m[8] * dz;
          const ly = m[1] * dx + m[5] * dy + m[9] * dz;
          const lz = m[2] * dx + m[6] * dy + m[10] * dz;

          const nx0 = lx * invRx;
          const ny0 = ly * invRy;
          const nz0 = lz * invRz;
          const k0 = Math.sqrt(nx0 * nx0 + ny0 * ny0 + nz0 * nz0);

          let d;
          if (k0 < 1e-5) {
            d = -Math.min(rx, ry, rz);
          } else {
            const nx1 = nx0 * invRx;
            const ny1 = ny0 * invRy;
            const nz1 = nz0 * invRz;
            const k1 = Math.sqrt(nx1 * nx1 + ny1 * ny1 + nz1 * nz1);
            d = k0 * (k0 - 1.0) / k1;
          }

          const idx = yzOffset + ix;
          if (isSubtract) {
            grid[idx] = SDFBuilder.ssub(grid[idx], d, k);
          } else {
            grid[idx] = SDFBuilder.smin(grid[idx], d, k);
          }
        }
      }
    }
  }

  /**
   * Mirrors the evaluated x >= 0 half-field into x < 0, extracts a watertight
   * Surface Nets manifold mesh, and applies non-shrinking Taubin smoothing.
   */
  extractGeometry(smoothingPasses = 3) {
    const { nx, ny, nz, midX, strideY, strideZ, grid, minX, minY, minZ, voxelSize } = this;

    // 1. Mirror X >= 0 into X < 0 for seamless bilateral symmetry
    for (let iz = 0; iz < nz; iz++) {
      const zOff = iz * strideZ;
      for (let iy = 0; iy < ny; iy++) {
        const yzOff = zOff + iy * strideY;
        for (let dx = 1; dx <= midX; dx++) {
          grid[yzOff + (midX - dx)] = grid[yzOff + (midX + dx)];
        }
      }
    }

    // 2. Surface Nets Pass 1: Place 1 vertex in every active sign-changing cell
    const cellVertIndex = new Int32Array(this.totalVoxels);
    cellVertIndex.fill(-1);

    const positions = [];
    const cubeEdges = [
      [0, 1], [2, 3], [4, 5], [6, 7], // X edges
      [0, 2], [1, 3], [4, 6], [5, 7], // Y edges
      [0, 4], [1, 5], [2, 6], [3, 7], // Z edges
    ];
    const cornerOffsets = [
      [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
      [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
    ];
    const cornerVals = new Float32Array(8);

    for (let iz = 0; iz < nz - 1; iz++) {
      const zOff = iz * strideZ;
      for (let iy = 0; iy < ny - 1; iy++) {
        const yzOff = zOff + iy * strideY;
        for (let ix = 0; ix < nx - 1; ix++) {
          const base = yzOff + ix;

          cornerVals[0] = grid[base];
          cornerVals[1] = grid[base + 1];
          cornerVals[2] = grid[base + strideY];
          cornerVals[3] = grid[base + strideY + 1];
          cornerVals[4] = grid[base + strideZ];
          cornerVals[5] = grid[base + strideZ + 1];
          cornerVals[6] = grid[base + strideZ + strideY];
          cornerVals[7] = grid[base + strideZ + strideY + 1];

          let mask = 0;
          for (let c = 0; c < 8; c++) {
            if (cornerVals[c] < 0.0) mask |= (1 << c);
          }
          if (mask === 0 || mask === 255) continue;

          let sumX = 0, sumY = 0, sumZ = 0, count = 0;
          for (let e = 0; e < 12; e++) {
            const c0 = cubeEdges[e][0];
            const c1 = cubeEdges[e][1];
            const v0 = cornerVals[c0];
            const v1 = cornerVals[c1];
            if ((v0 < 0.0) !== (v1 < 0.0)) {
              const t = v0 / (v0 - v1);
              const o0 = cornerOffsets[c0];
              const o1 = cornerOffsets[c1];
              sumX += o0[0] + (o1[0] - o0[0]) * t;
              sumY += o0[1] + (o1[1] - o0[1]) * t;
              sumZ += o0[2] + (o1[2] - o0[2]) * t;
              count++;
            }
          }

          const invCount = 1.0 / count;
          const vx = minX + (ix + sumX * invCount) * voxelSize;
          const vy = minY + (iy + sumY * invCount) * voxelSize;
          const vz = minZ + (iz + sumZ * invCount) * voxelSize;

          const vIdx = positions.length / 3;
          cellVertIndex[base] = vIdx;
          positions.push(vx, vy, vz);
        }
      }
    }

    // 3. Surface Nets Pass 2: Emit quads (2 triangles) around every sign-changing interior grid edge
    const indices = [];

    const emitQuad = (c00, c10, c11, c01, flip) => {
      // Split along shorter diagonal for superior curvature preservation
      const ax = positions[c00 * 3] - positions[c11 * 3];
      const ay = positions[c00 * 3 + 1] - positions[c11 * 3 + 1];
      const az = positions[c00 * 3 + 2] - positions[c11 * 3 + 2];
      const bx = positions[c10 * 3] - positions[c01 * 3];
      const by = positions[c10 * 3 + 1] - positions[c01 * 3 + 1];
      const bz = positions[c10 * 3 + 2] - positions[c01 * 3 + 2];
      const d00_11 = ax * ax + ay * ay + az * az;
      const d10_01 = bx * bx + by * by + bz * bz;

      if (d00_11 <= d10_01) {
        if (!flip) {
          indices.push(c00, c10, c11, c00, c11, c01);
        } else {
          indices.push(c00, c11, c10, c00, c01, c11);
        }
      } else {
        if (!flip) {
          indices.push(c10, c11, c01, c10, c01, c00);
        } else {
          indices.push(c10, c01, c11, c10, c00, c01);
        }
      }
    };

    for (let iz = 1; iz < nz - 1; iz++) {
      const zOff = iz * strideZ;
      for (let iy = 1; iy < ny - 1; iy++) {
        const yzOff = zOff + iy * strideY;
        for (let ix = 1; ix < nx - 1; ix++) {
          const base = yzOff + ix;
          const v0 = grid[base];
          const s0 = v0 < 0.0;

          // +X edge: (ix, iy, iz) -> (ix+1, iy, iz)
          const sx = grid[base + 1] < 0.0;
          if (s0 !== sx) {
            const c00 = cellVertIndex[base - strideY - strideZ];
            const c10 = cellVertIndex[base - strideZ];
            const c11 = cellVertIndex[base];
            const c01 = cellVertIndex[base - strideY];
            if (c00 >= 0 && c10 >= 0 && c11 >= 0 && c01 >= 0) {
              emitQuad(c00, c10, c11, c01, !s0);
            }
          }

          // +Y edge: (ix, iy, iz) -> (ix, iy+1, iz)
          const sy = grid[base + strideY] < 0.0;
          if (s0 !== sy) {
            const c00 = cellVertIndex[base - 1 - strideZ];
            const c10 = cellVertIndex[base - 1];
            const c11 = cellVertIndex[base];
            const c01 = cellVertIndex[base - strideZ];
            if (c00 >= 0 && c10 >= 0 && c11 >= 0 && c01 >= 0) {
              emitQuad(c00, c10, c11, c01, !s0);
            }
          }

          // +Z edge: (ix, iy, iz) -> (ix, iy, iz+1)
          const sz = grid[base + strideZ] < 0.0;
          if (s0 !== sz) {
            const c00 = cellVertIndex[base - 1 - strideY];
            const c10 = cellVertIndex[base - strideY];
            const c11 = cellVertIndex[base];
            const c01 = cellVertIndex[base - 1];
            if (c00 >= 0 && c10 >= 0 && c11 >= 0 && c01 >= 0) {
              emitQuad(c00, c10, c11, c01, !s0);
            }
          }
        }
      }
    }

    const posArray = new Float32Array(positions);
    const numVerts = posArray.length / 3;

    // 4. Taubin lambda-mu non-shrinking surface smoothing
    if (smoothingPasses > 0 && numVerts > 0) {
      this._taubinSmooth(posArray, indices, numVerts, smoothingPasses, 0.45, -0.473);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    // Store rest-pose position so procedural coat shader stays locked to skin during animation!
    geometry.setAttribute('aRestPos', new THREE.BufferAttribute(new Float32Array(posArray), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  _taubinSmooth(pos, indices, numVerts, passes, lambda, mu) {
    // Accumulate neighbor sums directly per triangle edge (2x per interior edge, symmetric!)
    const temp = new Float32Array(pos.length);
    const counts = new Uint16Array(numVerts);

    const step = (factor) => {
      temp.fill(0);
      counts.fill(0);

      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];

        const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
        const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
        const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];

        temp[a * 3] += bx + cx; temp[a * 3 + 1] += by + cy; temp[a * 3 + 2] += bz + cz;
        counts[a] += 2;

        temp[b * 3] += ax + cx; temp[b * 3 + 1] += ay + cy; temp[b * 3 + 2] += az + cz;
        counts[b] += 2;

        temp[c * 3] += ax + bx; temp[c * 3 + 1] += ay + by; temp[c * 3 + 2] += az + bz;
        counts[c] += 2;
      }

      for (let v = 0; v < numVerts; v++) {
        const cnt = counts[v];
        if (cnt === 0) continue;
        const inv = 1.0 / cnt;
        const v3 = v * 3;
        pos[v3] += factor * (temp[v3] * inv - pos[v3]);
        pos[v3 + 1] += factor * (temp[v3 + 1] * inv - pos[v3 + 1]);
        pos[v3 + 2] += factor * (temp[v3 + 2] * inv - pos[v3 + 2]);
      }
    };

    for (let p = 0; p < passes; p++) {
      step(lambda);
      step(mu);
    }
  }
}
