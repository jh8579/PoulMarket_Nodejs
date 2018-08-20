var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var myBucket = 'poul-shop';
AWS.config.loadFromPath("./config/awsconfig.json");
var s3_aws = {};
const signedUrlExpireSeconds = 60 * 60 * 24 * 5

// s3_aws.addUser = function addDefaultFolder(username){
//   var dir = username + "/file/"
//   var params = {Bucket: myBucket, Key: dir};
//   s3.putObject(params, function(err, data) {
//     if (err) {
//       console.log(err)
//     } else {
//       console.log("Successfully Add Default Folder to" + myBucket + ' ' + username);
//     }
//   });
// }

s3_aws.addFolder = function addNewFolder(username, folderDir){
  params = {Bucket: myBucket, Key: username + folderDir};
  s3.putObject(params, function(err, data) {
    if (err) {
      console.log(err)
    } else {
      console.log("Successfully Add New Folder to" + myBucket + ' ' + folderDir);
    }
  });
}

s3_aws.addFile = function(files, dir, callback){
  var params = {Bucket: myBucket, Key: dir, Body: files};
  s3.putObject(params, function(err, data) {
      if (err) {
        console.log(err)
      } else {
        console.log("Successfully Add File to " + myBucket);
        callback(null);
      }
    });

}

s3_aws.downloadFile = function(dir, callback){
  params = {Bucket: myBucket, Key: dir,  Expires: signedUrlExpireSeconds};
  s3.getSignedUrl('getObject', params, function(err, data) {
    if (err) {
      console.log(err)
    } else {
      console.log("Successfully Download " + myBucket+ ' ' + dir );
      callback(data);
    }
  });
}

s3_aws.deleteFile = function(dir){
  params = {Bucket: myBucket, Key: dir};
  s3.deleteObject(params, function(err, data) {
    if (err) {
      console.log(err)
    } else {
      console.log("Successfully Delete file" + myBucket+ ' ' + dir );
    }
  });
}


module.exports = s3_aws;
