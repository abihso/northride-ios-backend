import { Buffer } from "node:buffer";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client;

const storageConfig = () => {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  if (!region || !bucket) {
    throw new Error("Private document storage is not configured.");
  }
  client ??= new S3Client({ region });
  return { client, bucket };
};

export const createDocumentUploadUrl = async ({
  key,
  contentType,
  fileSize,
}) => {
  const { client: s3, bucket } = storageConfig();
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: fileSize,
      IfNoneMatch: "*",
    }),
    { expiresIn: 300 },
  );
};

export const createDocumentViewUrl = async ({ key, contentType }) => {
  const { client: s3, bucket } = storageConfig();
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: "inline",
      ResponseCacheControl: "private, no-store, max-age=0",
    }),
    { expiresIn: 300 },
  );
};

export const getUploadedDocumentMetadata = async (key) => {
  const { client: s3, bucket } = storageConfig();
  const [result, preview] = await Promise.all([
    s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
    s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-11" }),
    ),
  ]);
  const signature = Buffer.from(
    (await preview.Body?.transformToByteArray()) ?? [],
  );
  return {
    contentType: result.ContentType,
    fileSize: result.ContentLength,
    validImage: isSupportedDocumentImage(result.ContentType, signature),
  };
};

export const isSupportedDocumentImage = (contentType, bytes) => {
  if (contentType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    );
  }
  return false;
};

export const deleteStoredDocument = async (key) => {
  const { client: s3, bucket } = storageConfig();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
};
