/*global OAuth:true,google*/
(function(){
    'use strict';
    angular
    .module('NeighborhoodMap')
    .factory('locationsFactory', locationsFactory);

    locationsFactory.$inject = ['$http', '$log', '$q', '$window', '$timeout'];

    function locationsFactory($http, $log, $q, $window, $timeout){
        return {
            /**
             * Search for places based on the center and the boundaries of the map,
             * in the Google Places API
             * Returns a promise, which is resolved when the API call returns a response.
             * @param {object} map - Map returned from ngMap
             * @param {object} bounds - Bounds of the map
             */
            getGoogleNearbyPlaces: function(map, bounds) {
                var deferred = $q.defer(),
                    request = {
                        location: map.getCenter(),
                        bounds: bounds,
                        types: ['food'] // search for food places
                    },
                    service = new google.maps.places.PlacesService(map);
                service.nearbySearch(request, function(results, status) {
                    if (status == google.maps.places.PlacesServiceStatus.OK) {
                        deferred.resolve(results);
                    } else {
                        deferred.reject();
                    }
                })
                return deferred.promise;
            },
            /**
             * Search for a yelp business that matches with the google place result.
             * Returns a promise, which is resolved by a custom callback created
             * directly in the window object.
             * @param {string} placeId - Google Places API identifier
             * @param {string} placeName - Name of the location
             * @param {string} placeLocLat - Latitude of the location
             * @param {string} placeLocLng - Longitude of the location
             * @param {string} placeLocation - City where the location is
             */
            searchYelpBusiness: function(placeId, placeName, placeLocLat, placeLocLng, placeLocation) {
                var deferred = $q.defer(),
                    c = (new Date()).getTime(), // milliseconds to name the custom callback
                    oauth = OAuth({             // OAuth object with the yelp keys
                        consumer: {
                            public: '-0OmC9HI7oxDSZtNxu8sCQ',
                            secret: 'mk6UB3_5uLISj3-9sL_982lOl9M'
                        },
                        signature_method: 'HMAC-SHA1'
                    }),
                    request = {                 // parameters of the request
                        url: 'http://api.yelp.com/v2/search',
                        method: 'GET',
                        data: {
                            limit: 1,
                            term: placeName,
                            cll:  placeLocLat+','+placeLocLng,
                            location: placeLocation,
                            callback: 'yelp_callback_'+c+placeId
                        }
                    },
                    oauthToken = {              // yelp token
                        public: 'v3TxAKHJ7jxke9vbVI-CjBnOfVP2f3DZ',
                        secret: 'JWuqPhtTUFsc3k1H0cN5LREpBtA'
                    }
                // Create a timeout of 10 seconds to destroy the callback
                // and reject the promise
                var timeout = $timeout(function(){
                    delete $window['yelp_callback_'+c+placeId];
                    deferred.reject('');
                }, 10000);
                // The custom callback to receive the jsonp response from the yelp API
                $window['yelp_callback_'+c+placeId] = function (data) {
                    // Cancel the timeout
                    $timeout.cancel(timeout);
                    // destroy the callback
                    delete $window['yelp_callback_'+c+placeId];
                    // resolve the promise
                    deferred.resolve(data);
                };
                $http.jsonp(request.url, { params: oauth.authorize(request, oauthToken)});
                return deferred.promise;
            },
            /**
             * Search for a foursquare business that matches with the google place result.
             * Returns a jsonp promise.
             * @param {string} placeName - Name of the location
             * @param {string} placeLocLat - Latitude of the location
             * @param {string} placeLocLng - Longitude of the location
             * @param {string} placeLocation - City where the location is
             */
            searchFoursquareBusiness: function(placeName, placeLocLat, placeLocLng, placeLocation) {
                var params = {
                    client_id: 'CXKRXUECPPORHVJPSUPCXZU20DCKOBIHNYSISD1LZMZXJJMD',
                    client_secret: 'VNPDWMWMO5GFK1FR23PW1FM5TATJX5XMWGVZF1IFTLBGYHSP',
                    v: 20130815,
                    query: placeName,
                    ll: placeLocLat+','+placeLocLng,
                    callback: 'JSON_CALLBACK',
                    near: placeLocation,
                    limit: 1
                }
                return $http.jsonp('https://api.foursquare.com/v2/venues/search', { params: params });
            }
        }
    }
})();
