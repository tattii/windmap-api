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


/**
 *   wind data API
 *   	return: jsonp
 *   	params:
 *   		bounds: p1.lat, p1.lng, p2.lat, p2.lng  (required)
 *   		forecastTime: 0 - 39
 *   		zoom: 5 - 13
 */
app.get('/wind', function(req, res) {
	// check query
	var zoom = req.query.zoom;
	var forecastTime = req.query.forecastTime;
	var bounds_query = req.query.bounds; 
	
	var bounds = bounds_query.split(",").map(function(d){
		return parseFloat(d);
	});

	forecastTime = ( forecastTime == null ) ? 0 : parseInt(forecastTime);
	if ( forecastTime < 0 || forecastTime > 15 ){
		res.jsonp(500, { error: "No Data" });
	}

	zoom = ( zoom == null ) ? 9 : parseInt(forecastTime);

	MongoClient.connect(process.env.MONGOLAB_URI, function(err, db){
		if (err) res.jsonp(500, { error: "db error:" + err });
		findWindData(db, "wind_u", forecastTime, function(data) {
			var wind_u = extractBounds(data, bounds, zoom);
			findWindData(db, "wind_v", forecastTime, function(data) {
				var wind_v = extractBounds(data, bounds, zoom);
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
function extractBounds(data, bounds, zoom){
	if (data == null) throw new Error("db error: not found");

	var header = data.header
	var wind_data = data.data;

	var lo1 = header.lo1, la1 = header.la1;
	var lo2 = header.lo2, la2 = header.la2;
	var dx = header.dx, dy = header.dy;
	var nx = header.nx, ny = header.ny; 

	var xy1 = {
		x: range(Math.floor((bounds[1]-lo1) / dx), 0, nx-1),
		y: range(Math.floor((la1-bounds[0]) / dy), 0, ny-1)
	};
	var xy2 = {
		x: range(Math.ceil((bounds[3]-lo1) / dx), 0, nx-1),
		y: range(Math.ceil((la1-bounds[2]) / dy), 0, ny-1)
	};

	// 範囲抽出
	if ( zoom >= 9 ){
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

	// 範囲抽出（間引き）
	}else{
		if (zoom<5) zoom = 5;
		var thinout = Math.pow(2, 9-zoom);
		var	t_nx = Math.floor( (xy2.x-xy1.x) / thinout );
		var	t_ny = Math.floor( (xy2.y-xy1.y) / thinout );
		var xy3 = {
			x: xy1.x + thinout * t_nx,
			y: xy1.y + thinout * t_ny
		};

		var e = extractDataThinOut(wind_data, xy1, xy3, nx, thinout);

		return {
			header: {
				la1: la1 - dy * xy1.y,
				lo1: lo1 + dx * xy1.x,
				la2: la1 - dy * xy3.y,
				lo2: lo1 + dx * xy3.x,
				dx: dx * thinout,
				dy: dy * thinout,
				nx: t_nx + 1,
				ny: t_ny + 1
			},
			data: e
		};
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

	function N(x, y) { return nx * y + x; }

	for (var y = p1.y; y <= p2.y; y++) {
		push.apply(extract,  data.slice(N(p1.x, y), N(p2.x, y)+1) );
	}

	return extract;
}


function extractDataThinOut(data, p1, p2, nx, d) {
	var extract = [];

	function N(x, y) { return nx * y + x; }

	for (var y = p1.y; y <= p2.y; y += d ){
		for (var x = p1.x; x <= p2.x; x += d ){
			extract.push(data[N(x,y)]);
		}
	}

	return extract;
}




app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'));
});
