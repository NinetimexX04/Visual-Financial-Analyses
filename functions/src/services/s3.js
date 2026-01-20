const { s3 } = require('../config/aws');

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

async function saveToS3(key, data) {
  try {
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: 'application/json'
    };
    
    await s3.putObject(params).promise();
    
    console.log(`✓ Saved to S3: ${key}`);
    return true;
    
  } catch (error) {
    console.error(`Error saving to S3 (${key}):`, error.message);
    throw error;
  }
}

async function getFromS3(key) {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };
    
    const result = await s3.getObject(params).promise();
    
    const data = JSON.parse(result.Body.toString());
    
    console.log(`✓ Loaded from S3: ${key}`);
    return data;
    
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      console.log(`○ Not found in S3: ${key}`);
      return null;
    }
    
    console.error(`Error loading from S3 (${key}):`, error.message);
    throw error;
  }
}

async function deleteFromS3(key) {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };
    
    await s3.deleteObject(params).promise();
    
    console.log(`✓ Deleted from S3: ${key}`);
    return true;
    
  } catch (error) {
    console.error(`Error deleting from S3 (${key}):`, error.message);
    throw error;
  }
}

async function existsInS3(key) {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };
    
    await s3.headObject(params).promise();
    return true;
    
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
}

module.exports = {
  saveToS3,
  getFromS3,
  deleteFromS3,
  existsInS3
};