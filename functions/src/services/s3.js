const { s3 } = require('../config/aws');

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

/**
 * Save data to S3
 * @param {string} key - File path in S3 (like "correlations/matrix.json")
 * @param {Object|string} data - Data to save (will be converted to JSON if object)
 * @returns {Promise} - Resolves when save is complete
 * 
 * HOW IT WORKS:
 * - Takes your data and uploads it to S3 bucket
 * - Like saving a file to cloud storage
 * - Key is like the filename/path
 */
async function saveToS3(key, data) {
  try {
    // Convert data to string if it's an object
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    
    // S3 putObject uploads the data
    const params = {
      Bucket: BUCKET_NAME,           // Which bucket to save to
      Key: key,                       // Filename/path
      Body: body,                     // The actual data
      ContentType: 'application/json' // Tell S3 this is JSON
    };
    
    await s3.putObject(params).promise();
    
    console.log(`✓ Saved to S3: ${key}`);
    return true;
    
  } catch (error) {
    console.error(`Error saving to S3 (${key}):`, error.message);
    throw error;
  }
}

/**
 * Load data from S3
 * @param {string} key - File path in S3 to retrieve
 * @returns {Promise<Object|null>} - Returns parsed JSON data, or null if not found
 * 
 * HOW IT WORKS:
 * - Tries to download file from S3
 * - If file exists, returns the data
 * - If file doesn't exist, returns null (not an error)
 */
async function getFromS3(key) {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };
    
    // S3 getObject downloads the file
    const result = await s3.getObject(params).promise();
    
    // Convert downloaded data back to JavaScript object
    const data = JSON.parse(result.Body.toString());
    
    console.log(`✓ Loaded from S3: ${key}`);
    return data;
    
  } catch (error) {
    // If file doesn't exist, return null (this is expected sometimes)
    if (error.code === 'NoSuchKey') {
      console.log(`○ Not found in S3: ${key}`);
      return null;
    }
    
    // Other errors are real problems
    console.error(`Error loading from S3 (${key}):`, error.message);
    throw error;
  }
}

/**
 * Delete data from S3
 * @param {string} key - File path to delete
 * @returns {Promise<boolean>}
 * 
 * WHEN YOU'D USE THIS:
 * - Clear old cached data
 * - Remove outdated correlation matrices
 */
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

/**
 * Check if a file exists in S3
 * @param {string} key - File path to check
 * @returns {Promise<boolean>} - True if exists, false otherwise
 */
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

// Test code
if (require.main === module) {
  // Test saving and loading
  const testData = {
    test: 'hello',
    number: 123,
    timestamp: new Date().toISOString()
  };
  
  const testKey = 'test/sample.json';
  
  console.log('\n=== Testing S3 Operations ===\n');
  
  saveToS3(testKey, testData)
    .then(() => getFromS3(testKey))
    .then(loaded => {
      console.log('\nLoaded data:', loaded);
      return deleteFromS3(testKey);
    })
    .then(() => console.log('\n✓ All S3 tests passed!'))
    .catch(error => console.error('Test failed:', error));
}