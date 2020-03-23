'use strict';
const crypto = require('crypto');
const pug = require('pug');
const Cookies = require('cookies');
const util = require('./handler-util');
const Post = require('./post');
const moment = require('moment-timezone');

const trackingIdKey = 'tracking_id';
const oneTimeTokenMap = new Map(); // キーをユーザー名、値をトークンとする連想配列


function handle(req, res){
  const cookies = new Cookies(req, res);
  const trackingId = addTrackingCookie(cookies, req.user);

  switch(req.method){
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      Post.findAll({order:[['id', 'DESC']]}).then((posts) =>{
      posts.forEach((post) =>{
        post.content = post.content.replace(/\+/g, ' ');
        post.formattedCreatedAt = moment(post.createdAt).tz('Asia/Tokyo').format('YYYY年MM月DD日　HH時mm分ss秒');
      })
      const oneTimeToken = crypto.randomBytes(8).toString('hex');
      oneTimeTokenMap.set(req.user, oneTimeToken);
      res.end(pug.renderFile('./views/posts.pug', {
        posts: posts,
        user: req.user,
        oneTimeToken: oneTimeToken
      }));
      console.info(
        `閲覧されました： user： ${req.user}, ` +
        `trackingId: ${trackingId},` +
        `IPアドレス： ${req.connection.remoteAddress}, ` + 
        `ユーザーエージェント： ${req.headers['user-agent']}`
      )
      })
      break;
    case 'POST':
      let body = '';
      req.on('data', (chunk) =>{
        body += chunk;
      }).on('end', () =>{
        const decoded = decodeURIComponent(body);
        const dataArray = decoded.split('&');
        const content = dataArray[0] ? dataArray[0].split('content=')[1] : '';
        const requestedOneTimeToken = dataArray[1] ? dataArray[1].split('oneTimeToken=')[1] : '';
        if (oneTimeTokenMap.get(req.user) === requestedOneTimeToken) {
          console.info('投稿されました: ' + content);
          Post.create({
            content: content,
            trackingCookie: trackingId,
            postedBy: req.user
          }).then(() => {
            oneTimeTokenMap.delete(req.user);
            handleRedirectPosts(req, res);
          });
        } else {
          util.handleBadRequest(req, res);
        }
      });
      break;
    default:
        util.handleBadRequest(req, res);
      break;
  }
}

function handleDelete(req, res){
  switch(req.method){
    case 'POST':
      let body = [];
      req.on('data', (chunk) =>{
        body += chunk;
      }).on('end', () =>{
        const decoded = decodeURIComponent(body);
        const dataArray = decoded.split('&');
        const id = dataArray[0] ? dataArray[0].split('id=')[1] : '';
        const requestedOneTimeToken = dataArray[1] ? dataArray[1].split('oneTimeToken=')[1] : '';
        console.info(decoded);
        if(oneTimeTokenMap.get(req.user) === requestedOneTimeToken){
          Post.findById(id).then((post) =>{
            if(req.user === post.postedBy || req.user === 'admin'){
              post.destroy().then(() =>{
                console.info(
                  `削除されました： user: ${req.user}, ` +
                  `remoteAddress: ${req.connection.remoteAddress}, ` +
                  `userAgent: ${req.headers['user-agent']}`
                );
                oneTimeTokenMap.delete(req, res);
                handleRedirectPosts(req, res);
              });
            }
          });
        }else {
          util.handleBadRequest(req, res);
        } 
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

/** 
 * Cookieに含まれているトラッキングIDに異常がなければその値を返し、
 * 存在しない場合や異常なものである場合には、再度作成しCookieに付与してその値を返す
 * @param {Cookies} cookies
 * @param {String} userName
 * @return {String} トラッキングID
 */
function addTrackingCookie(cookies, userName) {
  const requestedTrackingId = cookies.get(trackingIdKey);
  if (isValidTrackingId(requestedTrackingId, userName)) {
    return requestedTrackingId;
  } else {
    const originalId = parseInt(crypto.randomBytes(8).toString('hex'),16);
    const tomorrow = new Date(Date.now() + (1000 * 60 * 60 * 24));
    const trackingId = originalId + '_' + createValidHash(originalId, userName);
    cookies.set(trackingIdKey, trackingId, { expires: tomorrow });
    return trackingId;
  }
}

function isValidTrackingId(trackingId, userName) {
  if (!trackingId) {
    return false;
  }
  const splitted = trackingId.split('_');
  const originalId = splitted[0];
  const requestedHash = splitted[1];
  return createValidHash(originalId, userName) === requestedHash;
}

const secretKey =
  `7081b0e2cbe6dea8ab9e04cb156c10c31e791556eee11c265d75419a204176
  23a60f847200a3e1308c231691b8fa33cc239a02ed621c4d1a1ced11e28eb4d
  90e29eea4a938dd96bc48b63224dcedbb7639c376881b0965b74a86be15793e
  157a04ae542eacb61f3ae828fb088504247369ab5b55b858c8f1b7fa8684b54
  98b98431ee4a4854bafb8014e40b2bed31d3b628a9df97bdf21880364bb4d52
  d2b282fc469fc001625c939f81eb64ad5f97fdd9c4d599e678ab425be9e5937
  0129e2a18e5c620ad8827d6cc60371e509199a0d858e24980eccfa98c517108
  a032a30202616d7763ec2a5826a09b16cf7a44ef80bdbaf981b581dd6b5fae7
  02d7c3f18`;


function createValidHash(originalId, userName) {
  const sha1sum = crypto.createHash('sha1');
  sha1sum.update(originalId + userName + secretKey);
  return sha1sum.digest('hex');
}

function handleRedirectPosts(req, res){
  res.writeHead(303, {
    'Location': 'posts'
  });
  res.end();
}



module.exports = {
  handle,
  handleDelete
};