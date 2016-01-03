/*eslint no-unused-vars: [2, { "args": "all", "argsIgnorePattern": "NgMap|n" }]*/
/*global _, google,OAuth*/
(function () {
    'use strict';
    angular
    .module('NeighborhoodMap', [
        'ngAnimate',
        'ngAria',
        'ngMessages',
        'ngMaterial',
        'ngMap',
        'ngPromiseExtras'
    ])
    .config(configFunction) // allow Batarang
    .config(httpProviderInterceptor) // allow json interceptor
    .constant('_', _) // add lodash as constant
    .constant('google', google) // add google (library) as constant
    .constant('OAuth', OAuth) // add google (library) as constant
    .controller('AppController', AppController);

    configFunction.$inject = ['$compileProvider'];
    /* @ngInject */
    function configFunction($compileProvider) {
        // During development, you may want to set debugInfoEnabled to true. This is required for tools like
        // Protractor, Batarang and ng-inspector to work correctly. However do not check in this change.
        // This flag must be set to false in production for a significant performance boost.
        $compileProvider.debugInfoEnabled(true);
    }

    httpProviderInterceptor.$inject = ['$httpProvider'];
    function httpProviderInterceptor($httpProvider) {
        $httpProvider.interceptors.push('jsonpInterceptor');
    }

    AppController.$inject = ['$scope', '$timeout', '$mdSidenav', '$q', '$log', 'NgMap', 'locationsFactory'];
    function AppController ($scope, $timeout, $mdSidenav, $q, $log, NgMap, locationsFactory) {
        var vm = this;
        // filter by location's name by default
        vm.queryFilterBy = 1;
        vm.map = null;
        vm.isLoading = true;
        vm.allLocations = {
            items: {
                'ChIJO7u9q5-AhYARiSSXyWv9eJ8': {
                    google: {
                        name: 'Zuni Café.',
                        place_id: 'ChIJO7u9q5-AhYARiSSXyWv9eJ8',
                        types: ['restaurant'],
                        icon: 'https://maps.gstatic.com/mapfiles/place_api/icons/restaurant-71.png',
                        photos: [
                            {
                                getUrl: function() {return 'https://maps.gstatic.com/mapfiles/place_api/icons/restaurant-71.png';}
                            }
                        ],
                        geometry: {
                            location: {
                                lat: function() {return 37.77362420000001;},
                                lng: function() {return -122.4216426;}
                            }
                        },
                        vicinity: '1658 Market Street, San Francisco',
                        rating: 4.1
                    },
                    yelp: null,
                    foursquare: null
                }
            }
        }
        vm.mapLocations = [];
        vm.selectedMarkerId = false;
        vm.processYelpResponse = function(place_id, response) {
            $log.log(place_id);
            $log.log(response);
            if (response.status === 200 && response.data.businesses.length > 0) {
                vm.allLocations.items[place_id].yelp = response.data.businesses[0];
                $log.log('yelp saved');
            }
        }
        vm.parseGoogleLocations = function(results) {
            var newMapLocations = [],
                httpRequests = []
            _.forEach(results, function(n) {
                var newLocation = {
                        google: n,
                        yelp: null,
                        foursquare: null
                    },
                    locationSimplified = _.trim((_.words(n.vicinity, /[^,]+/g)).pop());
                if (angular.isDefined(vm.allLocations.items[n.place_id])) {
                    // rescue from the cache
                    newLocation['yelp'] = vm.allLocations.items[n.place_id].yelp;
                    newLocation['foursquare'] = vm.allLocations.items[n.place_id].foursquare;
                } else {
                    // set cache
                    vm.allLocations.items[n.place_id] = newLocation;
                    // push the new info request
                    //var newYelpRequest = ;
                    httpRequests.push(locationsFactory.searchYelpBusiness(
                            n.name,
                            n.geometry.location.lat(),
                            n.geometry.location.lng(),
                            locationSimplified
                        ).success(function(response){
                            $log.log('success solver task');
                            $log.log(response);
                        }));
                }
                newMapLocations.push(newLocation);
            })
            $log.log(newMapLocations);
            vm.mapLocations = newMapLocations;
            $q.allSettled(httpRequests).then(function (data){
                $log.log('success');
                $log.log(data); // Should all be here
            });
        }
        vm.updateLocations = function() {
            var bounds = vm.map.getBounds();
            vm.showLoadingBar();
            vm.selectedMarkerId = false;
            vm.map.hideInfoWindow('map-iw');
            if (angular.isDefined(bounds)) {
                locationsFactory.getGoogleNearbyPlaces(
                        vm.map,
                        vm.map.getBounds())
                    .then(function(results){
                        vm.parseGoogleLocations(results);
                    })
                    .finally(function(){
                        vm.hideLoadingBar();
                    });
            } else {
                vm.hideLoadingBar();
            }
        }
        vm.selectItem = function (place_id) {
            vm.selectedMarkerId = false;
            _.forEach(vm.map.markers, function (n, key){
                if (n.id === place_id) {
                    vm.map.markers[key].setAnimation(google.maps.Animation.BOUNCE);
                    vm.selectedMarkerId = place_id;
                } else {
                    vm.map.markers[key].setAnimation(null);
                }
            });
            if (vm.selectedMarkerId !== false) {
                // open info window
                vm.map.showInfoWindow('map-iw', vm.selectedMarkerId);
                // if it's mobile view
                if (!$mdSidenav('left').isLockedOpen()){
                    // close left sidenav
                    vm.closeSearchPanel();
                }
            }
        }
        vm.getSelectedItem = function() {
            var item = vm.allLocations.items[vm.selectedMarkerId];
            if (angular.isUndefined(item)) {
                item = false;
            }
            return item;
        }
        vm.populateYelpData = function() {
            var item = vm.getSelectedItem();
            $log.log(item);
            if (item && item.yelp === null) {
                var locationSimplified = _.trim((_.words(item.google.vicinity, /[^,]+/g)).pop());
                $log.log(locationSimplified);
                locationsFactory.searchYelpBusiness(
                        item.google.name,
                        item.google.geometry.location.lat(),
                        item.google.geometry.location.lng(),
                        locationSimplified
                    ).
                    then(function(response){
                        $log.log(response);
                        if (response.status === 200 && response.data.businesses.length > 0) {
                            vm.allLocations.items[item.google.place_id].yelp = response.data.businesses[0];
                            $log.log('yelp saved');
                        }
                    });
            }
        }
        vm.populateFoursquareData = function() {
            var item = vm.getSelectedItem();
            $log.log(item);
            if (item && item.foursquare === null) {
                var locationSimplified = _.trim((_.words(item.google.vicinity, /[^,]+/g)).pop());
                $log.log(locationSimplified);
                $q.all([locationsFactory.searchFoursquareBusiness(
                        item.google.name,
                        item.google.geometry.location.lat(),
                        item.google.geometry.location.lng(),
                        locationSimplified
                    )]).
                    then(function(response){
                        $log.log(response);
                        /*if (response.status === 200 && response.data.businesses.length > 0) {
                            vm.allLocations.items[item.google.place_id].yelp = response.data.businesses[0];
                            $log.log('yelp saved');
                        }*/
                    });
            }
        }
        vm.showMoreDetails = function() {
            // show right slide
        }
        vm.clickMarker = function(event, place_id) {
            vm.selectItem(place_id);
        }
        vm.initMap = function(map) {
            vm.map = map;
            $scope.$apply();
            $timeout(function(){
                vm.updateLocations();
            }, 600);
        }
        vm.closeSearchPanel = function () {
            $mdSidenav('left').close();
        }
        vm.openSearchPanel = function () {
            $mdSidenav('left').open();
        }
        vm.showLoadingBar = function(){
            vm.isLoading = true;
        }
        vm.hideLoadingBar = function(){
            vm.isLoading = false;
        }
    }
})();
