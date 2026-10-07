/** MyTree — Indian cities used for demo data, geofence checks and region drill-downs. */
(function () {
  'use strict';
  var MT = window.MT;
  MT.geoData = {
    /** name, state, lat, lng, radius (km) used for "outside declared city" geofence warnings */
    cities: [
      { name: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567, r: 35 },
      { name: 'Mumbai', state: 'Maharashtra', lat: 19.076, lng: 72.8777, r: 40 },
      { name: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882, r: 30 },
      { name: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898, r: 25 },
      { name: 'Delhi', state: 'Delhi', lat: 28.6139, lng: 77.209, r: 45 },
      { name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946, r: 40 },
      { name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707, r: 35 },
      { name: 'Hyderabad', state: 'Telangana', lat: 17.385, lng: 78.4867, r: 40 },
      { name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, r: 35 },
      { name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873, r: 30 },
      { name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714, r: 35 },
      { name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126, r: 25 },
      { name: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673, r: 25 },
      { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462, r: 30 }
    ],
    states: ['Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Other'],
    city: function (name) { return MT.geoData.cities.filter(function (c) { return c.name === name; })[0]; },
    slug: function (s) { return String(s || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  };
})();
