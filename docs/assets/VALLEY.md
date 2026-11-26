# Portal Valley asset inventory and build

The companion [asset manifest](valley-manifest.json) records the author, source URL, license, redistribution conditions, source format and size, derivative hash, triangle count, image size and practical limitation for each asset family. The [source lockfile](../../scripts/valley/sources.json) records the exact upstream file URLs, byte counts and SHA-256 hashes. Asset bytes are stored with the project so entering the valley never requires contacting an asset marketplace.

## Rights

The sources below are published by Poly Haven under CC0 1.0. Commercial use, modification and redistribution are permitted. CC0 does not require attribution. The manifest credits the contributing artists. Site previews and editorial illustrations are excluded from this pack. Both tree images are renders of licensed geometry that we produced offline. [Publisher’s asset license](https://polyhaven.com/license) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

## Table C · Asset inventory

Source bytes count the exact component files fetched for offline preparation. Optimized bytes include all delivery variants for an asset family. A browser downloads the subset selected by its route and quality tier. These are file sizes, not GPU-memory measurements.
| Asset | Original source | License | Source bytes | Optimized bytes | Texture format | Scene |
| --- | --- | --- | ---: | ---: | --- | --- |
| Forest Ground 04 | [Poly Haven](https://polyhaven.com/a/forest_ground_04) | CC0 | 3,068,218 | 554,330 | WebP | Portal Valley |
| Rock Face | [Poly Haven](https://polyhaven.com/a/rock_face) | CC0 | 1,872,578 | 224,678 | WebP | Portal Valley |
| Aerial Grass Rock | [Poly Haven](https://polyhaven.com/a/aerial_grass_rock) | CC0 | 666,655 | 231,560 | WebP | Portal Valley |
| Moss Rock Set 01 | [Poly Haven](https://polyhaven.com/a/rock_moss_set_01) | CC0 | 8,197,182 | 457,668 | WebP | Portal Valley |
| Fern 02 | [Poly Haven](https://polyhaven.com/a/fern_02) | CC0 | 1,392,399 | 107,180 | WebP | Portal Valley |
| Fir Tree 01 texture components | [Poly Haven](https://polyhaven.com/a/fir_tree_01) | CC0 | 2,560,248 | 601,622 | WebP | Portal Valley |
| Tree Small 02 | [Poly Haven](https://polyhaven.com/a/tree_small_02) | CC0 | 101,219,226 | 97,074 | WebP | Portal Valley |
| Lago d’Isola | [Poly Haven](https://polyhaven.com/a/lago_disola) | CC0 | 56,619,883 | 624,479 | WebP + RGBE | Portal Valley |
Total derivative bytes: 2898591

## Offline workflow

Use Python 3, NumPy, Pillow with WebP and Blender 4.3.2. From the repository root, run the preparation and inventory commands. Compiling the web app does not require these art tools.

```sh
python scripts/valley/prepare.py /tmp/valley-source
python scripts/valley/inventory.py
```

The first command downloads only pinned sources whose checksum differs from the cache. Set aside at least 500 MB for downloads, intermediate images and the broadleaf model. Blender bakes the tree impostors locally using CPU Cycles. The second command measures the outputs on disk, writes the manifest and prints Table C. Encoder or renderer versions may change derivative checksums. Upstream content changes stop preparation at checksum verification.

1. The boulder and fern generators select one mesh from each source glTF, discard the other variants and unused buffers, and center the selected object on its bottom bounding plane. The boulder uses a crop of its original 4K shared atlas. Remapped UVs dedicate the full 1K derivative to one rock. The low mesh preserves the same UV layout and has 300 triangles. The near mesh has 5,000.
2. The fern combines a color photograph and the matching source alpha channel before encoding. The result retains the original leaf silhouettes and normal map. Its 784 triangles support midground clusters.
3. The fir uses a seeded, original whorled-branch mesh with taper, branch curvature, bark microrelief and cutout needle sprays. Distant trees use a 512 × 768 RGBA bake. The taller fir is paired with a separate 640 × 640 broadleaf bake to vary the forest silhouette. The original broadleaf has more than two million triangles.
4. The three terrain materials supply independently tiling images for the shaded moss, gravel path and exposed rock zones. Color maps require sRGB decoding. Normal and roughness maps are linear data. Standard terrain color maps are 1K, low maps are 512 pixels wide, and scalar and normal maps use lower resolutions. The 2K photographic panorama supplies the distant wooded slopes and snowy peaks of Lago d’Isola. A horizontal wrap aligns the snowy pass with the arrival direction. A matching 256 × 128 HDR light probe is area-averaged in linear light from the original 2K RGBE exposure, preserving its full radiance range and azimuth.
5. Models use core glTF 2.0 geometry with 16-bit mesh indices and embedded EXT_texture_webp images. The pinned Three.js GLTFLoader handles this extension directly in a WebP-capable browser. The package does not require a separate mesh decoder or texture transcoder.

## GPU implications

WebP reduces transfer size. Its GPU upload is still uncompressed and its mip chain consumes additional memory. For example, a 1024-square RGBA8 texture with a full mip chain costs approximately 5.33 MiB. Smaller source resolutions reduce this cost quadratically. A later KTX2/Basis trial should include real-device upload time, color fidelity, memory and the initial transcoder cost. Near and far boulders favor short static geometry over a per-frame simplifier. Foliage alpha overdraw still increases with density and eye count, even with instancing. Impostors belong beyond the distance where lateral head motion reveals the flat capture plane.
