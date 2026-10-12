import assert from "node:assert/strict";
import test from "node:test";
import { parseProduct } from "../src/routes/productRoute.js";
import { parseShop } from "../src/routes/shopRoute.js";

test("shop creation trims required fields and accepts URLs or uploaded image keys", () => {
  const parsed = parseShop({
    ownerId: "12",
    shopName: "  Market One  ",
    shopCategory: "groceries",
    address: "  Main Road  ",
    latitude: "5.6037",
    longitude: "-0.1870",
    logo: "https://images.example.test/logo.png",
  });

  assert.deepEqual(parsed.value, {
    ownerId: 12,
    shopName: "Market One",
    shopCategory: "groceries",
    address: "Main Road",
    latitude: "5.6037",
    longitude: "-0.187",
    logo: "https://images.example.test/logo.png",
  });
  assert.match(
    parseShop({
      ownerId: 12,
      shopName: "Market",
      address: "Main Road",
      latitude: 5.6,
      longitude: -0.2,
      logo: "javascript:alert(1)",
    }).error,
    /valid URL or uploaded shop image/,
  );
  assert.equal(
    parseShop({
      ownerId: 12,
      shopName: "Market",
      address: "Main Road",
      latitude: 5.6,
      longitude: -0.2,
      logo: "shop-catalog/550e8400-e29b-41d4-a716-446655440000",
    }).value.logo,
    "shop-catalog/550e8400-e29b-41d4-a716-446655440000",
  );
  assert.match(
    parseShop({
      ownerId: 12,
      shopName: "Market",
      address: "Main Road",
    }).error,
    /shop location on the map/,
  );
});

test("shop updates accept only validated provided fields", () => {
  assert.deepEqual(parseShop({ isOpen: false }, true).value, { isOpen: false });
  assert.match(
    parseShop({ latitude: 5.6 }, true).error,
    /both shop location coordinates/,
  );
  assert.match(parseShop({ latitude: 91 }, true).error, /latitude/);
  assert.match(parseShop({ isVerified: "true" }, true).error, /true or false/);
});

test("product creation validates price, stock, discounts, and uploaded image keys", () => {
  const parsed = parseProduct({
    productName: "  Apples ",
    price: "3.5",
    discountPrice: "3",
    stockQuantity: "8",
    imageUrl: "https://images.example.test/apples.png",
  });

  assert.equal(parsed.value.productName, "Apples");
  assert.equal(parsed.value.price, "3.50");
  assert.equal(parsed.value.discountPrice, "3.00");
  assert.equal(parsed.value.stockQuantity, 8);
  assert.equal(
    parseProduct({
      productName: "Apples",
      price: 3,
      imageUrl: "shop-catalog/550e8400-e29b-41d4-a716-446655440000",
    }).value.imageUrl,
    "shop-catalog/550e8400-e29b-41d4-a716-446655440000",
  );
  assert.match(parseProduct({ productName: "Apples" }).error, /price is required/);
  assert.match(
    parseProduct({ productName: "Apples", price: 3, discountPrice: 3 }).error,
    /less than/,
  );
  assert.match(
    parseProduct({ productName: "Apples", price: 3, stockQuantity: -1 }).error,
    /stockQuantity/,
  );
});

test("product updates validate booleans and non-negative stock fields", () => {
  assert.deepEqual(parseProduct({ isAvailable: false }, true).value, {
    isAvailable: false,
  });
  assert.match(parseProduct({ stockQuantity: 2.5 }, true).error, /whole number/);
  assert.match(parseProduct({ isFeatured: "yes" }, true).error, /true or false/);
});
