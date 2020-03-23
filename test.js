'use strict';
const pug = require('pug');
const assert = require('assert');

const html = pug.renderFile('./views/posts.pug', {
  posts: [{
      ID: 1,
      content: `<sctipt>alert('Hello')</sctipt>`,
      trackingCookie: 1,
      createdAt: new Date(),
      updatedAt: new Date()
  }],
  user: 'guest1'
});

//実際にテスト
assert(html.includes(`&lt;sctipt&gt;alert('Hello')&lt;/sctipt&gt;`));
console.log('テストは正常に完了しました')