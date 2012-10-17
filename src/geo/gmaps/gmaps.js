
// if google maps is not defined do not load the class
if(typeof(google) != "undefined" && typeof(google.maps) != "undefined") {

var DEFAULT_MAP_STYLE = [ { stylers: [ { saturation: -65 }, { gamma: 1.52 } ] },{ featureType: "administrative", stylers: [ { saturation: -95 }, { gamma: 2.26 } ] },{ featureType: "water", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "administrative.locality", stylers: [ { visibility: "off" } ] },{ featureType: "road", stylers: [ { visibility: "simplified" }, { saturation: -99 }, { gamma: 2.22 } ] },{ featureType: "poi", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "road.arterial", stylers: [ { visibility: "off" } ] },{ featureType: "road.local", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "transit", stylers: [ { visibility: "off" } ] },{ featureType: "road", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "poi", stylers: [ { saturation: -55 } ] } ];



cdb.geo.GoogleMapsMapView = cdb.geo.MapView.extend({

  layerTypeMap: {
    "tiled": cdb.geo.GMapsTiledLayerView,
    "cartodb": cdb.geo.GMapsCartoDBLayerView,
    "plain": cdb.geo.GMapsPlainLayerView,
    "gmapsbase": cdb.geo.GMapsBaseLayerView
  },

  initialize: function() {
    _.bindAll(this, '_ready');
    this._isReady = false;
    var self = this;

    cdb.geo.MapView.prototype.initialize.call(this);
    var center = this.map.get('center');
    if(!this.options.map_object) {
      this.map_googlemaps = new google.maps.Map(this.el, {
        center: new google.maps.LatLng(center[0], center[1]),
        zoom: this.map.get('zoom'),
        minZoom: this.map.get('minZoom'),
        maxZoom: this.map.get('maxZoom'),
        disableDefaultUI: true,
        mapTypeControl:false,
        mapTypeId: google.maps.MapTypeId.ROADMAP
      });
    } else {
      this.map_googlemaps = this.options.map_object;
      this.setElement(this.map_googlemaps.getDiv());
    }


    this._bindModel();
    this._addLayers();

    google.maps.event.addListener(this.map_googlemaps, 'center_changed', function() {
        var c = self.map_googlemaps.getCenter();
        self._setModelProperty({ center: [c.lat(), c.lng()] });
    });

    google.maps.event.addListener(this.map_googlemaps, 'zoom_changed', function() {
      self._setModelProperty({
        zoom: self.map_googlemaps.getZoom()
      });
    });

    google.maps.event.addListener(this.map_googlemaps, 'click', function(e) {
        self.trigger('click', e);
    });

    google.maps.event.addListener(this.map_googlemaps, 'dblclick', function(e) {
        self.trigger('dblclick', e);
    });

    this.map.layers.bind('add', this._addLayer, this);
    this.map.layers.bind('remove', this._removeLayer, this);
    this.map.layers.bind('reset', this._addLayers, this);

    this.projector = new cdb.geo.CartoDBLayerGMaps.Projector(this.map_googlemaps);

    this.projector.draw = this._ready;

  },

  _ready: function() {
    this.projector.draw = function() {};
    this.trigger('ready');
    this._isReady = true;
    var bounds = this.map.getViewBounds();
    if(bounds) {
      this.showBounds(bounds);
    }
  },

  _setZoom: function(model, z) {
    this.map_googlemaps.setZoom(z);
  },

  _setCenter: function(model, center) {
    var c = new google.maps.LatLng(center[0], center[1]);
    this.map_googlemaps.setCenter(c);
  },

  _addLayer: function(layer, layers, opts) {
    opts = opts || {};
    var self = this;
    var lyr, layer_view;

    var layerClass = this.layerTypeMap[layer.get('type').toLowerCase()];

    if (layerClass) {
      layer_view = new layerClass(layer, this.map_googlemaps);
    } else {
      cdb.log.error("MAP: " + layer.get('type') + " can't be created");
    }

    this.layers[layer.cid] = layer_view;

    if (layer_view) {
      var idx = _.keys(this.layers).length  - 1;
      var isBaseLayer = idx === 0 || (opts && opts.index === 0);
      // set base layer
      if(isBaseLayer && !opts.no_base_layer) {
        var m = layer_view.model;
        if(m.get('type') == 'GMapsBase') {
          layer_view._update();
        } else {
          layer_view.isBase = true;
          layer_view._update();
        }
      } else {
        idx -= 1;
        idx = Math.max(0, idx); // avoid -1
        self.map_googlemaps.overlayMapTypes.setAt(idx, layer_view.gmapsLayer);
      }
      layer_view.index = idx;
      this.trigger('newLayerView', layer_view, this);
    } else {
      cdb.log.error("layer type not supported");
    }
  },

  latLonToPixel: function(latlon) {
    return this.projector.latLngToPixel(new google.maps.LatLng(latlon[0], latlon[1]));
  },

  getSize: function() {
    return {
      x: this.$el.width(),
      y: this.$el.height()
    };
  },

  panBy: function(p) {
    var c = this.map.get('center');
    var pc = this.latLonToPixel(c);
    p.x += pc.x;
    p.y += pc.y;
    var ll = this.projector.pixelToLatLng(p);
    this.map.setCenter([ll.lat(), ll.lng()]);
  },

  getBounds: function() {
    var b = this.map_googlemaps.getBounds();
    var sw = b.getSouthWest();
    var ne = b.getNorthEast();
    return [
      [sw.lat(), sw.lng()],
      [ne.lat(), ne.lng()]
    ];
  },

  showBounds: function(bounds) {
    var sw = bounds[0];
    var ne = bounds[1];
    var southWest = new google.maps.LatLng(sw[0], sw[1]);
    var northEast = new google.maps.LatLng(ne[0], ne[1]);
    this.map_googlemaps.fitBounds(new google.maps.LatLngBounds(southWest, northEast));
  },

  setAutoSaveBounds: function() {
    var self = this;
    // save on change
    this.map.bind('change:center change:zoom', _.debounce(function() {
      if(self._isReady) {
        var b = self.getBounds();
        self.map.save({
          view_bounds_sw: b[0],
          view_bounds_ne: b[1]
        }, { silent: true });
      }
    }, 1000), this);
  }

});

}