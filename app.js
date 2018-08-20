require('date-utils');
var express = require('express');
var http = require('http');
var path = require('path');
var async = require('async');

var bodyParser = require('body-parser');

var mysql = require('mysql');

var s3 = require('./s3.js');

var multer = require('multer');
var memoryStorage = multer.memoryStorage();
var upload = multer({
  storage: memoryStorage
});

var app = express();

app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(bodyParser.json({
  extended: true
}));
app.use(express.favicon());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.errorHandler());

var conn = mysql.createConnection({
  host: process.env.RDS_HOSTNAME,
  user: process.env.RDS_USERNAME,
  password: process.env.RDS_PASSWORD,
  port: process.env.RDS_PORT,
  multipleStatements : true
});

///// 물품 관련 /////
// 중고 물품 등록
app.post('/addThing', upload.array('file'), function(req, res) {
  var title = req.body.title;
  var category = req.body.category;
  var sellerId = req.body.seller_id;
  var uuid = req.body.uuid;
  var price = req.body.price;
  var picDir = "";

  var tasks = [
    function(callback){
      var count = 0;
      req.files.forEach(function(fileObj, index) {
        // s3에 사진정보 추가
        var s3Dir = fileObj.originalname;

        s3.addFile(fileObj.buffer, s3Dir, function(){
          s3.downloadFile(s3Dir, function(data){
            count++;
            picDir += data;
            console.log(count);
            if(count == req.files.length){
              callback(null);
            }
          });
        });
      });
    },
    function(callback){
      console.log("create data");
      var newThing = {
        title: title,
        category: category,
        picDir: picDir,
        sellerId: sellerId,
        uuid: uuid,
        price: price
      }
      callback(null, newThing);
    },
    function(data, callback){
      // 로컬 db에 사진 업로드
      var sql = "INSERT INTO poulshop.thing SET ?";
      conn.query(sql, data, function(err, results) {
        if (err) {
          console.log(err);
          res.send(err);
        } else {
          console.log("local save");
          res.send(results);
        }
      });
    }
  ];

  async.waterfall(tasks, function (err) {
    if (err)
        console.log('err');
    else
        console.log('done');
  });
});

// 중고 물품 조회
app.get('/getThing', function(req, res) {
  var thingId = req.query.thingId;

  var sql = "SELECT * FROM poulshop.thing WHERE id = ?;"
  conn.query(sql, [thingId], function(err, results) {
    if (err) {
      console.log(err);
    }
    res.send(results[0]);
  });
});

// 중고 물품 검색
app.get('/search', function(req, res){
  var category = req.query.category;
  var title = req.query.title;
  var seller_id = req.query.seller_id;
  var buyer_id = req.query.buyer_id;
  if(category){
    var sql = "SELECT poulshop.thing.*, poulshop.user.sellerTier FROM poulshop.thing INNER JOIN poulshop.user ON poulshop.thing.sellerId = poulshop.user.id WHERE UPPER(category) like UPPER(?);"
    conn.query(sql, [category+ "%"], function(err, results) {
      if (err) {
        console.log(err);
      }
      res.send(
        {
          result : results
        }
      );
    });
  } else if(title){
    var sql = "SELECT poulshop.thing.*, poulshop.user.sellerTier FROM poulshop.thing INNER JOIN poulshop.user ON poulshop.thing.sellerId = poulshop.user.id WHERE UPPER(title) like UPPER(?);"
    conn.query(sql, [title+ "%"], function(err, results) {
      if (err) {
        console.log(err);
      }
      res.send( {
          result : results
        });
    });
  } else if(seller_id){
    var sql = "SELECT * FROM poulshop.thing WHERE seller_id like ?;"
    conn.query(sql, [seller_id+ "%"], function(err, results) {
      if (err) {
        console.log(err);
      }
      res.send(  {
          result : results
        });
    });
  } else if(buyer_id){
    var sql = "SELECT * FROM poulshop.thing WHERE buyer_id like ?;"
    conn.query(sql, [buyer_id+ "%"], function(err, results) {
      if (err) {
        console.log(err);
      }
      res.send(  {
          result : results
        });
    });
  }
});

// 중고 물품 최신 5개
app.get('/recentThing', function(req, res){
  var sql = "SELECT poulshop.thing.*, poulshop.user.sellerTier FROM poulshop.thing INNER JOIN poulshop.user ON poulshop.thing.sellerId = poulshop.user.id WHERE status = false ORDER BY id desc limit 5;"
  conn.query(sql, function(err, results) {
    if (err) {
      console.log(err);
    }
    res.send({result: results});
  });
})


///// 거래 관련 /////
// 거래 요청
app.post('/requestTrade', function(req, res){
  var itemId = req.body.itemId;
  var buyerId = req.body.buyerId;

  var newTrade = {
    itemId: itemId,
    buyerId: buyerId
  }

  var sql = "INSERT INTO poulshop.trade SET ?";
  conn.query(sql, newTrade, function(err, results) {
    if (err) {
      console.log(err);
      res.send({"code": "ERROR"})
    } else {
      res.send({"code": "OK"});
    }
  });
});

// 거래 요청 목록 출력
app.get('/listAskTrade', function(req, res){
  var itemId = req.query.itemId;

  var sql = "SELECT poulshop.trade.*, poulshop.user.username, poulshop.user.buyerTier FROM poulshop.trade INNER JOIN poulshop.user ON poulshop.trade.buyerId = poulshop.user.id WHERE poulshop.trade.itemId = ? ORDER BY poulshop.user.buyerTier desc;"
  conn.query(sql, [itemId],function(err, results) {
    if (err) {
      console.log(err);
    }
    console.log({result: results});
  });
});

app.get('/listTrade', function(req, res){
  var sellerId = req.query.sellerId;
  var buyerId = req.query.buyerId;

  if(sellerId){
    var sql = "SELECT poulshop.thing.title, poulshop.thing.status FROM poulshop.thing WHERE poulshop.thing.sellerId = ?;"
    conn.query(sql, [sellerId],function(err, results) {
      if (err) {
        console.log(err);
      }
      res.send({result: results});
    });
  } else if(buyerId){
    var sql = "SELECT poulshop.thing.title, poulshop.thing.status FROM poulshop.thing WHERE poulshop.thing.buyerId = ?;"
    conn.query(sql, [buyerId],function(err, results) {
      if (err) {
        console.log(err);
      }
      res.send({result: results});
    });
  }



})

// 거래 승인
app.post('/acceptTrade', function(req, res){
  var itemId = req.body.itemId;
  var buyerId = req.body.buyerId

  var sql = "UPDATE poulshop.thing SET status = true, buyerId = ? WHERE id = ?"
  conn.query(sql, [buyerId, itemId], function(err, results) {
    if (err) {
      console.log(err);
      res.send({code: "error"})
    }
    console.log(results);
    res.send({code: "OK"})
  });
});


///// 사용자 관련 /////
// 회원 가입
app.post('/addUser', upload.single('file'), function(req, res) {
  var username = req.body.username;
  var password = req.body.password;
  var email = req.body.email;
  var etherAddress = req.body.etherAddress;

  var newUser = {
    email: email,
    password: password,
    username: username,
    etherAddress: etherAddress
  }

  var sql = "INSERT INTO poulshop.user SET ?";
  conn.query(sql, newUser, function(err, results) {
    if (err) {
      console.log(err);
      res.send(
        {
          "code" : "EXIST"
        }
      );
    } else {
      res.send({"code" : "OK"});
    }
  });
});

// 로그인
app.post('/login', upload.single('file'), function(req, res) {
  var email = req.body.email;
  var password = req.body.password;

  var sql = "SELECT * FROM poulshop.user WHERE email = ? AND password = ?;"
  conn.query(sql, [email, password], function(err, result) {
    if (err) {
      console.log(err);
    }
    if(result.length >= 1){
      res.send(
        {
          code: "OK",
          userdata: result[0]
        }
      );
    }else{
      var sql1 = "SELECT * FROM poulshop.user WHERE email = ?;"
      sql1 += "SELECT * FROM poulshop.user WHERE password = ?;"
      conn.query(sql1, [email, password], function(err, results) {
        if (err) {
          console.log(err);
        }
        if(results[0].length == 0){
          res.send({code:"NOT_FOUND"});
        }else if(results[1].length == 0){
          res.send({code:"WRONG_PASSWORD"});
        }
      });
    }

  });
});

// 사용자 정보 조회
app.post('/getUser', upload.single('file'), function(req, res){
  var id = req.body.id;
  var username = req.body.username;

  if(id){
    var sql = "SELECT * FROM poulshop.user WHERE id = ?;"
    conn.query(sql, [id], function(err, results) {
      if (err) {
        console.log(err);
      }
      res.send(results);
    });
  } else if(username){
    var sql = "SELECT * FROM poulshop.user WHERE username = ?;"
    conn.query(sql, [username], function(err, results) {
      if (err) {
        console.log(err);
      }
      res.send({result: results});
    });
  }
})

// 판매자 최고 티어
app.get('/bestTier', function(req, res){
  var sql = "SELECT * FROM poulshop.user ORDER BY sellerTier desc limit 4;"
  conn.query(sql, function(err, results) {
    if (err) {
      console.log(err);
    }
    res.send({result: results});
  });
})


http.createServer(app).listen(app.get('port'), function() {
  console.log("Express server listening on port " + app.get('port'));
});
