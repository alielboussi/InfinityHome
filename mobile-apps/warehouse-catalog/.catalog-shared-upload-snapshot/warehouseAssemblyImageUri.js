import {
  assemblyImageUrlFromRow,
  resolveSeaterSetCoverImageUrl,
  resolveWarehouseCatalogAssemblyImageUri,
} from './repoSrc/utils/warehouseSeaterSetCoverImage.js';

export {
  assemblyImageUrlFromRow,
  resolveSeaterSetCoverImageUrl,
  resolveWarehouseCatalogAssemblyImageUri,
};

/** @deprecated use resolveWarehouseCatalogAssemblyImageUri */
export function resolveAssemblyImageUri(assembly, options) {
  return resolveWarehouseCatalogAssemblyImageUri(assembly, options);
}
