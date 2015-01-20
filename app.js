var express = require('express');
var MongoClient = require('mongodb').MongoClient;

var app = express();
app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'ejs');

app.use(function(err, req, res, next) {
	console.log(err);
	res.jsonp(500, {error: err});
});



app.get('/', function(req, res) {
	res.render("index");
});


app.get('/wind', function(req, res) {
	var forecastTime = req.query.forecastTime;
	var bounds_query = req.query.bounds; // [ p1.lat, p1.lng, p2.lat, p2.lng ]
	var zoom = req.query.zoom;
	
	forecastTime = ( forecastTime == null ) ? 0 : parseInt(forecastTime);
	if ( forecastTime < 0 || forecastTime > 15 ){
		res.jsonp(500, { error: "No Data" });
	}

	var bounds = bounds_query.split(",").map(function(d){
		return parseFloat(d);
	});

	console.log(forecastTime);

	MongoClient.connect(process.env.MONGOLAB_URI, function(err, db){
		if (err) res.jsonp(500, { error: "db error:" + err });
		findWindData(db, "wind_u", forecastTime, function(data) {
			var wind_u = extractBounds(data, bounds);
			findWindData(db, "wind_v", 0, function(data) {
				var wind_v = extractBounds(data, bounds);
				res.jsonp({
					header: wind_u.header,
					wind_u: wind_u.data,
					wind_v: wind_v.data
				});
			});
		});
	});
});


// mongodb
function findWindData(db, col, forecastTime, callback) {
	var collection = db.collection(col);
	collection.findOne(
		{ 'header.forecastTime': forecastTime },
		function(err, item){
			if (err) console.log(err);
			callback(item);
	});
}


// grib data
function extractBounds(data, bounds){
	if (data == null) throw new Error("db error: not found");

	var header = data.header
	var wind_data = data.data;

	var lo1 = header.lo1, la1 = header.la1;
	var lo2 = header.lo2, la2 = header.la2;
	var dx = header.dx, dy = header.dy;
	var nx = header.nx, ny = header.ny; 

	var xy1 = latlng2xy(bounds[0], bounds[1]);
	var xy2 = latlng2xy(bounds[2], bounds[3]);
	xy1.x--; xy1.y--;

	// 範囲抽出
	var e = extractData(wind_data, xy1, xy2, nx);

	return {
		header: {
			la1: la1 - dy * xy1.y,
			lo1: lo1 + dx * xy1.x,
			la2: la1 - dy * xy2.y,
			lo2: lo1 + dx * xy2.x,
			dx: dx,
			dy: dy,
			nx: xy2.x - xy1.x + 1,
			ny: xy2.y - xy1.y + 1
		},
		data: e
	};

	function latlng2xy(lat, lng) {
		var x = Math.ceil( (lng - lo1) / dx );
		var y = Math.ceil( (la1 - lat) / dy );
		return {x:range(x,1,nx), y:range(y,1,ny)};
	}

	function range(t, min, max) {
		if ( t < min ){
			return min;
		}else if ( t > max ){
			return max;
		}else{
			return t;
		}
	}
}

function extractData(data, p1, p2, nx) {
	var extract = [];
	var push = Array.prototype.push;

	function N(x, y) { return nx * y + x - 1; }

	for (var y = p1.y; y <= p2.y; y++) {
		push.apply(extract,  data.slice(N(p1.x, y), N(p2.x, y)+1) );
	}

	return extract;
}





app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'));
});
