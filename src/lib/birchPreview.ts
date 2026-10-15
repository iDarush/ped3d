import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

export interface BirchPreview {
  card?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  lods: { bark: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; leaves: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> }[];
  dispose: () => void;
}

/** Local personal-project assets, staged by tools/prepare-local-models.mjs. */
export async function loadBirchPreview(renderer: THREE.WebGLRenderer, withCards = false): Promise<BirchPreview> {
  const base = import.meta.env.BASE_URL;
  const ktx = new KTX2Loader().setTranscoderPath(base + "basis/").detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };
  try {
    const lods: BirchPreview["lods"] = [];
    for (const level of [0, 1]) {
      const gltf = await loader.loadAsync(`${base}scene-assets/birch/birch_lod${level}.glb`);
      gltf.scene.updateMatrixWorld(true);
      const height = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y;
      if (!(height > 0)) throw new Error("Birch has invalid height");
      let bark: BirchPreview["lods"][number]["bark"] | undefined;
      let leaves: BirchPreview["lods"][number]["leaves"] | undefined;
      gltf.scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (Array.isArray(obj.material) || !(obj.material instanceof THREE.MeshStandardMaterial)) throw new Error("Expected one PBR material per birch primitive");
        geometries.add(obj.geometry);
        materials.add(obj.material);
        Object.values(obj.material).forEach((v) => { if (v instanceof THREE.Texture) textures.add(v); });
        // Runtime tree matrices already multiply unit-height geometry by actual tree height.
        obj.geometry.applyMatrix4(obj.matrixWorld).scale(1 / height, 1 / height, 1 / height);
        const mesh = obj as BirchPreview["lods"][number]["bark"];
        if (mesh.material.alphaTest > 0) leaves = mesh;
        else bark = mesh;
      });
      if (!bark || !leaves) throw new Error("Birch bark or foliage missing");
      lods.push({ bark, leaves });
    }
    // Reuse the same GPU materials/textures for both geometry levels.
    lods[1].bark.material = lods[0].bark.material;
    lods[1].leaves.material = lods[0].leaves.material;
    let card: BirchPreview["card"];
    if (withCards) {
      try {
        const gltf = await loader.loadAsync(`${base}scene-assets/birch/cards/birch_card_cross.glb`);
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (Array.isArray(obj.material) || !(obj.material instanceof THREE.MeshStandardMaterial)) throw new Error("Invalid birch card material");
          geometries.add(obj.geometry); materials.add(obj.material);
          Object.values(obj.material).forEach((v) => { if (v instanceof THREE.Texture) textures.add(v); });
          // Card padding is intentional: unit scale is the source TREE height,
          // not the full card rectangle height. Never normalise its bounding box.
          obj.geometry.applyMatrix4(obj.matrixWorld);
          card = obj as BirchPreview["card"];
        });
        if (!card) throw new Error("Birch cross card missing");
      } catch (error) {
        card = undefined;
        console.warn("Birch cross cards unavailable; retaining model LODs", error);
      }
    }
    return { lods, card, dispose };
  } catch (error) {
    dispose();
    throw error;
  } finally {
    ktx.dispose();
  }
}
