import {
  createDocumentViewUrl,
  getUploadedDocumentMetadata,
} from "./riderDocumentStorage.js";

export const shopImageContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const shopImageMaxSize = 5 * 1024 * 1024;
export const shopImageKeyPattern =
  /^shop-catalog\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const presentImageUrl = async (value) => {
  if (!value) return null;
  if (!shopImageKeyPattern.test(value)) return value;
  return createDocumentViewUrl({ key: value, expiresIn: 3600 });
};

export const presentShopImages = async (shop) => ({
  ...shop,
  logoViewUrl: await presentImageUrl(shop.logo),
  coverImageViewUrl: await presentImageUrl(shop.coverImage),
});

export const presentProductImage = async (product) => ({
  ...product,
  imageViewUrl: await presentImageUrl(product.imageUrl),
});

export const isValidUploadedShopImage = async (key) => {
  if (typeof key !== "string" || !shopImageKeyPattern.test(key)) return false;
  try {
    const metadata = await getUploadedDocumentMetadata(key);
    return (
      shopImageContentTypes.has(metadata.contentType) &&
      Number.isInteger(metadata.fileSize) &&
      metadata.fileSize > 0 &&
      metadata.fileSize <= shopImageMaxSize &&
      metadata.validImage
    );
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") {
      return false;
    }
    throw error;
  }
};
