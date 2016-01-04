/*eslint no-unused-vars: [2, { "args": "all", "argsIgnorePattern": "NgMap|n" }]*/
/*global _, google,OAuth*/
(function () {
    'use strict';
    angular
    .module('NeighborhoodMap', [
        'ngAria',
        'ngMaterial',
        'ngMap',
        'ngStorage',
        'ngPromiseExtras'
    ])
    //.config(configFunction) // allow Batarang
    .constant('_', _) // add lodash as constant
    .constant('google', google) // add google (library) as constant
    .constant('OAuth', OAuth) // add OAuth library as constant (required for yelp)
    .controller('AppController', AppController);

    /*configFunction.$inject = ['$compileProvider'];
    function configFunction($compileProvider) {
        // During development, you may want to set debugInfoEnabled to true. This is required for tools like
        // Protractor, Batarang and ng-inspector to work correctly. However do not check in this change.
        // This flag must be set to false in production for a significant performance boost.
        $compileProvider.debugInfoEnabled(true);
    }*/

    AppController.$inject = ['$timeout', '$mdSidenav', '$q', '$localStorage', 'NgMap', 'locationsFactory'];
    function AppController ($timeout, $mdSidenav, $q, $localStorage, NgMap, locationsFactory) {
        var vm = this;
        // Set filter criteria for locations (1 for location's name [Default], 2 for address).
        vm.queryFilterBy = 1;
        // Map object used by ngMap.
        vm.map = null;
        // Set a flag for show the upper loading bar (used for indicate when it's looking for new locations)
        vm.isLoading = true;
        // Locations in the map.
        vm.mapLocations = [];
        // Google's place_id of the selected item in the listview or through the marker.
        vm.selectedMarkerId = false;
        /**
         * Method called by ngMap when the map initializes.
         * @param {object} map - Map object from ngMap
         */
        vm.initMap = function(map) {
            // Stores the map in the scope.
            vm.map = map;
            /**
             * Waits 600ms before load the locations (ensures that functions like map.getCenter() and map.getBounds() return a value)
             */
            $timeout(function(){
                vm.updateLocations();
            }, 600);
        }
        /**
         * Load the locations from Google Places API, or from the cache (vm.allLocations) when API fails.
         */
        vm.updateLocations = function() {
            // Get the map bounds
            var bounds = vm.map.getBounds();
            vm.showLoadingBar();
            // De-select the marker
            vm.selectItem(null);
            if (angular.isDefined(bounds)) {
                // If the map has bounds, call Google Places API
                locationsFactory.getGoogleNearbyPlaces(
                        vm.map,
                        vm.map.getBounds())
                    .then(function(results) {
                        /**
                         * Process the results from Google Places API
                         */
                        vm.parseGoogleLocations(results);
                    }, function () {
                        /**
                         * Error while retrieving the locations, then
                         * load the locations from the cache (vm.allLocations)
                         */
                        vm.loadAllLocations();
                    })
                    .finally(function(){
                        /**
                         * As final step, hide the loading bar
                         */
                        vm.hideLoadingBar();
                    });
            } else {
                // Load the locations from the cache (vm.allLocations)
                vm.loadAllLocations();
                // hide the loading bar
                vm.hideLoadingBar();
            }
        }
        /**
         * For each result returned by the Google Places API, store it in the vm.mapLocations
         * variable to make it usable by the listview and the map markers.
         * But before, it resolves the values for location.google.photos[0].getUrl40,
         * location.google.photos[0].getUrl280, location.google.geometry.location.latNum
         * and location.google.geometry.location.lngNum in order to have the raw values
         * instead of functions that can't be stored in a json string.
         * Also, launch the async calls to Yelp and Foursquare APIs.
         * @param {object} results - Array with the results from the Google Places API
         */
        vm.parseGoogleLocations = function(results) {
            // Create a temporary array for map locations (avoids multiple reflows in the view)
            var newMapLocations = [],
                httpRequests = [];
            _.forEach(results, function(n) {
                var newLocation = {
                        google: n,
                        yelp: null,
                        foursquare: null
                    },
                    locationSimplified = _.trim((_.words(n.vicinity, /[^,]+/g)).pop());
                // resolve photos urls
                if (angular.isDefined(newLocation.google.photos) && newLocation.google.photos.length > 0) {
                    newLocation.google.photos[0].getUrl40 = newLocation.google.photos[0].getUrl({maxHeight:40,maxWidth:40});
                    newLocation.google.photos[0].getUrl280 = newLocation.google.photos[0].getUrl({maxHeight:140,maxWidth: 280});
                }
                // resolve location's values
                newLocation.google.geometry.location.latNum = newLocation.google.geometry.location.lat();
                newLocation.google.geometry.location.lngNum = newLocation.google.geometry.location.lng();
                if (angular.isDefined(vm.allLocations.items[newLocation.google.place_id])) {
                    // rescue from the cache (vm.allLocations)
                    newLocation['yelp'] = vm.allLocations.items[newLocation.google.place_id].yelp;
                    newLocation['foursquare'] = vm.allLocations.items[newLocation.google.place_id].foursquare;
                } else {
                    // stores to cache (vm.allLocations) if doesn't exist
                    vm.allLocations.items[newLocation.google.place_id] = newLocation;
                    // Launch the call to Yelp API
                    var yelpRequest = locationsFactory.searchYelpBusiness(
                            newLocation.google.place_id,
                            newLocation.google.name,
                            newLocation.google.geometry.location.latNum,
                            newLocation.google.geometry.location.lngNum,
                            locationSimplified
                        ).then(function(response){
                            // Process response from the Yelp API
                            vm.processYelpResponse(newLocation.google.place_id, response);
                        });
                    // Launch the call to Foursquare API
                    var foursquareRequest = locationsFactory.searchFoursquareBusiness(
                            newLocation.google.name,
                            newLocation.google.geometry.location.latNum,
                            newLocation.google.geometry.location.lngNum,
                            locationSimplified
                        ).
                        then(function(response){
                            // Process response from the Foursquare API
                            vm.processFoursquareResponse(newLocation.google.place_id, response.data.response);
                        });
                    // Store the promises in an array
                    httpRequests.push(yelpRequest);
                    httpRequests.push(foursquareRequest);
                }
                newMapLocations.push(newLocation);
            })
            // Assign the map locations
            vm.mapLocations = newMapLocations;
            /**
             * Contrary to $q.all which as soon as the first promise gets rejected,
             * the reject callback is called with the error. It doesn't wait for other promises
             * to be resolved (https://github.com/kriskowal/q#combination)
             * $q.allSettled waits for all the promises (even if some of them fail)
             * (https://github.com/ohjames/angular-promise-extras)
             */
            $q.allSettled(httpRequests).then(function(){
                // Save the locations to localstorage after the API calls are over.
                $timeout(function(){
                    vm.saveLocalStorage();
                }, 600); // give some time to work to processYelpResponse and processFoursquareResponse methods
            });
        }
        /**
         * If Yelp API returned a value, store it in cache (vm.allLocations)
         * @param {string} place_id - Google Places API identifier
         * @param {object} response - Response from the API
         */
        vm.processYelpResponse = function(place_id, response) {
            // if returned a value
            if (response.businesses.length > 0) {
                // store it in cache (vm.allLocations)
                vm.allLocations.items[place_id].yelp = response.businesses[0];
            }
        }
        /**
         * If Foursquare API returned a value, store it in cache (vm.allLocations)
         * @param {string} place_id - Google Places API identifier
         * @param {object} response - Response from the API
         */
        vm.processFoursquareResponse = function(place_id, response) {
            // if returned a value
            if (response.venues.length > 0) {
                // store it in cache (vm.allLocations)
                vm.allLocations.items[place_id].foursquare = response.venues[0];
            }
        }
        /**
         * Load the locations to the map (vm.mapLocations) from the cache (vm.allLocations)
         */
        vm.loadAllLocations = function() {
            var storedMapLocations = [];
            _.forEach(vm.allLocations, function(n) {
                storedMapLocations.push(n);
            })
            vm.mapLocations = storedMapLocations;
        }
        /**
         * Select the marker of the item, sets the animation and if apply, open/hide the
         * infowindow.
         * @param {string} place_id - Google Places API identifier
         */
        vm.selectItem = function (place_id) {
            vm.selectedMarkerId = false;
            // loop through all the markers
            _.forEach(vm.map.markers, function (n, key){
                if (n.id === place_id) {
                    // start the marker bouncing
                    vm.map.markers[key].setAnimation(google.maps.Animation.BOUNCE);
                    // store the place_id of the selected marker
                    vm.selectedMarkerId = place_id;
                } else {
                    // stop the animation
                    vm.map.markers[key].setAnimation(null);
                }
            });
            // if there's an item selected
            if (vm.selectedMarkerId !== false) {
                // open info window
                vm.map.showInfoWindow('map-iw', vm.selectedMarkerId);
                // if it's mobile view
                if (!$mdSidenav('left').isLockedOpen()){
                    // close left sidenav
                    vm.closeSearchPanel();
                }
            } else {
                // else hide the info window
                vm.map.hideInfoWindow('map-iw');
            }
        }
        /**
         * Return the selected item from vm.allLocations
         */
        vm.getSelectedItem = function() {
            var item = vm.allLocations.items[vm.selectedMarkerId];
            if (angular.isUndefined(item)) {
                item = false;
            }
            return item;
        }
        /**
         * Method called by ngMap when user clicks a marker
         * @param {object} event - Event object sent by ngMap listener
         * @param {string} place_id - Google Places API identifier
         */
        vm.clickMarker = function(event, place_id) {
            vm.selectItem(place_id);
        }
        /**
         * Self-documented functions
         */
        vm.closeSearchPanel = function () {
            $mdSidenav('left').close();
        }
        vm.openSearchPanel = function () {
            $mdSidenav('left').open();
        }
        vm.showLoadingBar = function() {
            vm.isLoading = true;
        }
        vm.hideLoadingBar = function() {
            vm.isLoading = false;
        }
        vm.saveLocalStorage = function() {
            vm.$storage.allLocations = vm.allLocations;
        }
        // load the locations from the localstorage (the hardcoded locations as default)
        vm.$storage = $localStorage.$default({allLocations: {'items':{'ChIJO7u9q5-AhYARiSSXyWv9eJ8':{'ChIJcT5nNoaAhYARVdbyW3zPwus':{'google':{'geometry':{'location':{'lat':37.7852279,'lng':-122.40438899999998}},'icon':'https://maps.gstatic.com/mapfiles/place_api/icons/lodging-71.png','id':'f007d2f91c0070ebdfec60275baa33623f0b771b','name':'San Francisco Marriott Marquis','opening_hours':{'open_now':true,'weekday_text':[]},'photos':[{'height':1069,'html_attributions':['<a href=\'https://maps.google.com/maps/contrib/116211684039937392083/photos\'>San Francisco Marriott Marquis</a>'],'width':1069,'getUrl40':'https://lh4.googleusercontent.com/-9x9fiQuUn3Q/U3pjYN3TgWI/AAAAAAAAACg/r36yNQrQcVc/w40-h40-k/','getUrl280':'https://lh4.googleusercontent.com/-9x9fiQuUn3Q/U3pjYN3TgWI/AAAAAAAAACg/r36yNQrQcVc/w280-h140-k/'}],'place_id':'ChIJcT5nNoaAhYARVdbyW3zPwus','rating':4.1,'reference':'CoQBcgAAAJajGbzwaNucXqM858_G_mplwfOHOe9kgYjLEoODpDmp5OU5MQSeJFGELCD43Hq_tqY6S15e__9yeJTUQJPUZGqzZO-j0IdS51sSFDK6o9jLrHIPIYhwIKtFmZSahIur_51GRTe3c1SiweYIhbUJhtrNjfsJTxk2DssrxQveAvMiEhBdDeC_77MVzBPgKhW4PVpeGhQHbPLYvIKx4SC82XENrp9Z1Gff-Q','scope':'GOOGLE','types':['restaurant','food','lodging','point_of_interest','establishment'],'vicinity':'780 Mission Street, San Francisco','html_attributions':[]},'yelp':{'is_claimed':true,'rating':3.5,'mobile_url':'http://m.yelp.com/biz/san-francisco-marriott-marquis-san-francisco-2?utm_campaign=yelp_api&utm_medium=api_v2_search&utm_source=-0OmC9HI7oxDSZtNxu8sCQ','rating_img_url':'http://s3-media1.fl.yelpcdn.com/assets/2/www/img/5ef3eb3cb162/ico/stars/v1/stars_3_half.png','review_count':577,'name':'San Francisco Marriott Marquis','rating_img_url_small':'http://s3-media1.fl.yelpcdn.com/assets/2/www/img/2e909d5d3536/ico/stars/v1/stars_small_3_half.png','url':'http://www.yelp.com/biz/san-francisco-marriott-marquis-san-francisco-2?utm_campaign=yelp_api&utm_medium=api_v2_search&utm_source=-0OmC9HI7oxDSZtNxu8sCQ','categories':[['Hotels','hotels']],'phone':'4158961600','snippet_text':'I think this is my favorite hotel in S.F.\nI haven\'t stayed at the other Marriott in downtown (yet), but I love the location of this hotel and walked...','image_url':'http://s3-media1.fl.yelpcdn.com/bphoto/VpSVQCbX7C78ZqwR6o3Fmg/ms.jpg','snippet_image_url':'http://s3-media1.fl.yelpcdn.com/photo/IxXm_bp5Kcuez8KbXoiksw/ms.jpg','display_phone':'+1-415-896-1600','rating_img_url_large':'http://s3-media3.fl.yelpcdn.com/assets/2/www/img/bd9b7a815d1b/ico/stars/v1/stars_large_3_half.png','id':'san-francisco-marriott-marquis-san-francisco-2','is_closed':false,'location':{'cross_streets':'Opera Aly & 4th St','city':'San Francisco','display_address':['780 Mission Street','Financial District','San Francisco, CA 94103'],'geo_accuracy':9.5,'neighborhoods':['Financial District','SoMa'],'postal_code':'94103','country_code':'US','address':['780 Mission Street'],'coordinate':{'latitude':37.7848977064112,'longitude':-122.403850745866},'state_code':'CA'}},'foursquare':{'id':'49d2c3b6f964a520d15b1fe3','name':'San Francisco Marriott Marquis','contact':{'phone':'4158961600','formattedPhone':'(415) 896-1600'},'location':{'address':'780 Mission St','crossStreet':'btwn Market & Mission','lat':37.78519853205076,'lng':-122.4041533470154,'distance':20,'postalCode':'94103','cc':'US','city':'San Francisco','state':'CA','country':'Estados Unidos','formattedAddress':['780 Mission St (btwn Market & Mission)','San Francisco, CA 94103','Estados Unidos']},'categories':[{'id':'4bf58dd8d48988d1fa931735','name':'Hotel','pluralName':'Hoteles','shortName':'Hotel','icon':{'prefix':'https://ss3.4sqi.net/img/categories_v2/travel/hotel_','suffix':'.png'},'primary':true}],'verified':false,'stats':{'checkinsCount':39673,'usersCount':18085,'tipCount':139},'url':'http://www.marriott.com/hotels/travel/sfodt-san-francisco-marriott-marquis/','hasMenu':true,'menu':{'type':'Prices','label':'Precios','anchor':'Ver precios','url':'https://foursquare.com/v/san-francisco-marriott-marquis/49d2c3b6f964a520d15b1fe3/menu','mobileUrl':'https://foursquare.com/v/49d2c3b6f964a520d15b1fe3/device_menu'},'allowMenuUrlEdit':true,'specials':{'count':0,'items':[]},'hereNow':{'count':2,'summary':'2 personas están aquí','groups':[{'type':'others','name':'Otras personas aquí','count':2,'items':[]}]},'referralId':'v-1451886558','venueChains':[]}},'ChIJceeAXt6AhYARur0rWLmvt1A':{'google':{'geometry':{'location':{'lat':37.8067965,'lng':-122.43216889999997}},'icon':'https://maps.gstatic.com/mapfiles/place_api/icons/restaurant-71.png','id':'fd260b30f4d23f4f3d33298c550eb6277fdc5bd3','name':'Greens Restaurant','opening_hours':{'open_now':false,'weekday_text':[]},'photos':[{'height':648,'html_attributions':['<a href=\'https://maps.google.com/maps/contrib/101495021367761443234/photos\'>Walkerfive SFO</a>'],'width':1152,'getUrl40':'https://lh4.googleusercontent.com/-ofYaD-osinM/Ua5_-S1kOpI/AAAAAAAAFqw/Up4DnNLn9eg/w40-h40-k/','getUrl280':'https://lh4.googleusercontent.com/-ofYaD-osinM/Ua5_-S1kOpI/AAAAAAAAFqw/Up4DnNLn9eg/w280-h140-k/'}],'place_id':'ChIJceeAXt6AhYARur0rWLmvt1A','price_level':2,'rating':4.1,'reference':'CnRkAAAAgPWDFxLoKYY8lbnld0Y0jsa3b6INjKtcdAnKXJvEO32_upReE00IkwvieWcamSZSAKDIuv4Fmr7_5Gne3hTYtzYmtaLM23pjaYiIIyqzMg8yfVikizx3liuF17mUBqnQ93h9Sx7jcYuUxQoSqOy5jhIQbv5byD8mlmc4jlsRRIE0axoUOfwR7fg6Dan6zNaRWylJg6ueedU','scope':'GOOGLE','types':['restaurant','food','point_of_interest','establishment'],'vicinity':'A, Fort Mason, 2 Marina Boulevard, San Francisco','html_attributions':[]},'yelp':{'is_claimed':false,'rating':4,'mobile_url':'http://m.yelp.com/biz/greens-restaurant-san-francisco-3?utm_campaign=yelp_api&utm_medium=api_v2_search&utm_source=-0OmC9HI7oxDSZtNxu8sCQ','rating_img_url':'http://s3-media4.fl.yelpcdn.com/assets/2/www/img/c2f3dd9799a5/ico/stars/v1/stars_4.png','review_count':1531,'name':'Greens Restaurant','rating_img_url_small':'http://s3-media4.fl.yelpcdn.com/assets/2/www/img/f62a5be2f902/ico/stars/v1/stars_small_4.png','url':'http://www.yelp.com/biz/greens-restaurant-san-francisco-3?utm_campaign=yelp_api&utm_medium=api_v2_search&utm_source=-0OmC9HI7oxDSZtNxu8sCQ','categories':[['Vegetarian','vegetarian'],['Vegan','vegan'],['Gluten-Free','gluten_free']],'menu_date_updated':1441957376,'phone':'4157716222','snippet_text':'Beautiful setting with spectacular views of the Bay. Tucked away down by the water this gem of a spot has a casual counter and a large dining room for...','image_url':'http://s3-media3.fl.yelpcdn.com/bphoto/8fwQnmvYfLsrHUwiESHFsA/ms.jpg','snippet_image_url':'http://s3-media2.fl.yelpcdn.com/photo/S1cKLZ0S1dABWwkpexMXBA/ms.jpg','display_phone':'+1-415-771-6222','rating_img_url_large':'http://s3-media2.fl.yelpcdn.com/assets/2/www/img/ccf2b76faa2c/ico/stars/v1/stars_large_4.png','menu_provider':'single_platform','id':'greens-restaurant-san-francisco-3','is_closed':false,'location':{'city':'San Francisco','display_address':['Fort Mason','Bldg A','Marina/Cow Hollow','San Francisco, CA 94123'],'geo_accuracy':9.5,'neighborhoods':['Marina/Cow Hollow'],'postal_code':'94123','country_code':'US','address':['Fort Mason','Bldg A'],'coordinate':{'latitude':37.806105,'longitude':-122.431598},'state_code':'CA'}},'foursquare':{'id':'4a1c397bf964a520257b1fe3','name':'Greens Restaurant','contact':{'phone':'4157716222','formattedPhone':'(415) 771-6222'},'location':{'address':'Building A','crossStreet':'Fort Mason Center','lat':37.80666460115532,'lng':-122.43221998214722,'distance':15,'postalCode':'94123','cc':'US','city':'San Francisco','state':'CA','country':'Estados Unidos','formattedAddress':['Building A (Fort Mason Center)','San Francisco, CA 94123','Estados Unidos']},'categories':[{'id':'4bf58dd8d48988d1d3941735','name':'Restaurante vegetariano/vegano','pluralName':'Restaurantes vegetarianos/veganos','shortName':'Vegetariana/Vegetariana estricta','icon':{'prefix':'https://ss3.4sqi.net/img/categories_v2/food/vegetarian_','suffix':'.png'},'primary':true}],'verified':true,'stats':{'checkinsCount':6019,'usersCount':4389,'tipCount':85},'url':'http://www.greensrestaurant.com','hasMenu':true,'reservations':{'url':'http://www.opentable.com/single.aspx?rid=3135&ref=9601'},'menu':{'type':'Menu','label':'Menú','anchor':'Ver menú','url':'https://foursquare.com/v/greens-restaurant/4a1c397bf964a520257b1fe3/menu','mobileUrl':'https://foursquare.com/v/4a1c397bf964a520257b1fe3/device_menu'},'allowMenuUrlEdit':true,'specials':{'count':0,'items':[]},'venuePage':{'id':'90899552'},'hereNow':{'count':1,'summary':'Una persona más está aquí','groups':[{'type':'others','name':'Otras personas aquí','count':1,'items':[]}]},'referralId':'v-1451886558','venueChains':[]}},'ChIJ0XsfYyZ-j4ARNE4pMC-q7UI':{'google':{'geometry':{'location':{'lat':37.7691251,'lng':-122.41514010000003}},'icon':'https://maps.gstatic.com/mapfiles/place_api/icons/shopping-71.png','id':'a97b27ad1d47b234116dd65ab4d74572833dbcf1','name':'Rainbow Grocery','opening_hours':{'open_now':false,'weekday_text':[]},'photos':[{'height':1475,'html_attributions':['<a href=\'https://maps.google.com/maps/contrib/103329562044306939691/photos\'>Rainbow Grocery</a>'],'width':2048,'getUrl40':'https://lh4.googleusercontent.com/-OxBmzm0bP2M/VIp5crcixxI/AAAAAAAAAC4/97VJjly4yzg/w40-h40-k/','getUrl280':'https://lh4.googleusercontent.com/-OxBmzm0bP2M/VIp5crcixxI/AAAAAAAAAC4/97VJjly4yzg/w280-h140-k/'}],'place_id':'ChIJ0XsfYyZ-j4ARNE4pMC-q7UI','price_level':1,'rating':4.4,'reference':'CnRiAAAAhY5u1S1isVaDb971KOJsf6yA1U9gjyVKOyXgvG2qLWmlhFbuCXbPgmePo1xmOVsnkABufRNHE8e2KAxscfSYyeMLvpir9GmXoYXSr8xSY3Zg4nI6haBXZaiE4_9kUDRdchBu0d7dYzT0vVy4CkN5HRIQBCYJole4CafPOKGOwX2riBoUDb5wAzayjPfGlB6WIruvRyBGxJ4','scope':'GOOGLE','types':['grocery_or_supermarket','food','store','health','point_of_interest','establishment'],'vicinity':'1745 Folsom Street, San Francisco','html_attributions':[]},'yelp':null,'foursquare':{'id':'4827b8b1f964a520bb4f1fe3','name':'Rainbow Grocery','contact':{'phone':'4158630620','formattedPhone':'(415) 863-0620'},'location':{'address':'1745 Folsom St','crossStreet':'at 13th St','lat':37.769103368269896,'lng':-122.41523623466492,'distance':8,'postalCode':'94103','cc':'US','city':'San Francisco','state':'CA','country':'Estados Unidos','formattedAddress':['1745 Folsom St (at 13th St)','San Francisco, CA 94103','Estados Unidos']},'categories':[{'id':'4bf58dd8d48988d118951735','name':'Tienda de comestibles','pluralName':'Tiendas de comestibles','shortName':'Tienda de comestibles','icon':{'prefix':'https://ss3.4sqi.net/img/categories_v2/shops/food_grocery_','suffix':'.png'},'primary':true}],'verified':true,'stats':{'checkinsCount':18802,'usersCount':5233,'tipCount':130},'url':'http://www.rainbow.coop','allowMenuUrlEdit':true,'specials':{'count':0,'items':[]},'venuePage':{'id':'79421619'},'storeId':'','hereNow':{'count':0,'summary':'Nadie aquí','groups':[]},'referralId':'v-1451886558','venueChains':[]}},'ChIJG-PkK4-AhYARxW6vm0X9kCQ':{'google':{'geometry':{'location':{'lat':37.787184,'lng':-122.40744699999999}},'icon':'https://maps.gstatic.com/mapfiles/place_api/icons/restaurant-71.png','id':'5e04f10d60171a8be5d08617ad290a9c87302bfd','name':'The Cheesecake Factory','opening_hours':{'open_now':true,'weekday_text':[]},'photos':[{'height':250,'html_attributions':['<a href=\'https://maps.google.com/maps/contrib/101587777149034443900/photos\'>The Cheesecake Factory</a>'],'width':250,'getUrl40':'https://lh5.googleusercontent.com/-_oTHAxnvTlM/VAeKzKLC87I/AAAAAAAAAA4/K7Dux6myrgM/w40-h40-k/','getUrl280':'https://lh5.googleusercontent.com/-_oTHAxnvTlM/VAeKzKLC87I/AAAAAAAAAA4/K7Dux6myrgM/w280-h140-k/'}],'place_id':'ChIJG-PkK4-AhYARxW6vm0X9kCQ','rating':3.6,'reference':'CnRpAAAAhJtvrG4P6b11tBB5jqgeQqtPOOd_ePXu_rWlpa7LT3HChs-PLCEYFHfFEen5qYOpvYr0N9t0J5bTZX6fZH4wnvAwg5PJIZ3nUilVIy4tjUp07HtcqPSfql7wKWhr9-Rt10zXb098y5nBsEwkSGCn1RIQ1V1VMOTd-L0so4Hy2FmVThoUqc1Ll_Wi0lU0x949YdF7dEtcXZw','scope':'GOOGLE','types':['restaurant','food','point_of_interest','establishment'],'vicinity':'8th Floor, 251 Geary Street, San Francisco','html_attributions':[]},'yelp':null,'foursquare':{'id':'469019cbf964a5209f481fe3','name':'The Cheesecake Factory','contact':{'phone':'4153914444','formattedPhone':'(415) 391-4444','twitter':'cheesecake','facebook':'106628409154','facebookUsername':'thecheesecakefactory','facebookName':'The Cheesecake Factory'},'location':{'address':'251 Geary St','crossStreet':'btwn Powell St & Stockton St','lat':37.787352202751634,'lng':-122.40740954875946,'distance':19,'postalCode':'94102','cc':'US','city':'San Francisco','state':'CA','country':'Estados Unidos','formattedAddress':['251 Geary St (btwn Powell St & Stockton St)','San Francisco, CA 94102','Estados Unidos']},'categories':[{'id':'4bf58dd8d48988d14e941735','name':'Restaurante americano','pluralName':'Restaurantes americanos','shortName':'Americana','icon':{'prefix':'https://ss3.4sqi.net/img/categories_v2/food/default_','suffix':'.png'},'primary':true}],'verified':true,'stats':{'checkinsCount':32776,'usersCount':23703,'tipCount':381},'url':'http://www.thecheesecakefactory.com','hasMenu':true,'menu':{'type':'Menu','label':'Menú','anchor':'Ver menú','url':'https://foursquare.com/v/the-cheesecake-factory/469019cbf964a5209f481fe3/menu','mobileUrl':'https://foursquare.com/v/469019cbf964a5209f481fe3/device_menu'},'allowMenuUrlEdit':true,'specials':{'count':0,'items':[]},'hereNow':{'count':2,'summary':'2 personas están aquí','groups':[{'type':'others','name':'Otras personas aquí','count':2,'items':[]}]},'referralId':'v-1451886558','venueChains':[{'id':'556a4b41a7c8957d73d67d96'}]}},'ChIJqVjXkGGAhYAR5X80yCKz9Wo':{'google':{'geometry':{'location':{'lat':37.7934201,'lng':-122.3994664}},'icon':'https://maps.gstatic.com/mapfiles/place_api/icons/restaurant-71.png','id':'35f2341ce16ce57e6b3992b56f738e1f9f112a2d','name':'Tadich Grill','opening_hours':{'open_now':false,'weekday_text':[]},'photos':[{'height':2988,'html_attributions':['<a href=\'https://maps.google.com/maps/contrib/113370249731831794308/photos\'>Dan Rowe</a>'],'width':5312,'getUrl40':'https://lh3.googleusercontent.com/-151SZEMNyFk/VoGK7f3Zk6I/AAAAAAAAGJM/uTPDdzJY-y4/w40-h40-k/','getUrl280':'https://lh3.googleusercontent.com/-151SZEMNyFk/VoGK7f3Zk6I/AAAAAAAAGJM/uTPDdzJY-y4/w280-h140-k/'}],'place_id':'ChIJqVjXkGGAhYAR5X80yCKz9Wo','price_level':3,'rating':4,'reference':'CmRfAAAAi6su2PLUp7f_C4cmZCkYPpiXMZUYzYuO9KR4nQUoYJVd9AImiRxjy1lEC26Is4zydFdu9ewCpK4LTPIjAL25EENSaFhKGUfpiWyPpMLVRBrGRRABM8OxMZEOHEkJWEx7EhChJG-T0sxZXB50o4c-ad5SGhQ3Xv8RNvTfBMPjYsoVPnd6vMG-Iw','scope':'GOOGLE','types':['restaurant','bar','food','point_of_interest','establishment'],'vicinity':'240 California Street, San Francisco','html_attributions':[]},'yelp':{'is_claimed':true,'rating':4,'mobile_url':'http://m.yelp.com/biz/tadich-grill-san-francisco?utm_campaign=yelp_api&utm_medium=api_v2_search&utm_source=-0OmC9HI7oxDSZtNxu8sCQ','rating_img_url':'http://s3-media4.fl.yelpcdn.com/assets/2/www/img/c2f3dd9799a5/ico/stars/v1/stars_4.png','review_count':1580,'name':'Tadich Grill','rating_img_url_small':'http://s3-media4.fl.yelpcdn.com/assets/2/www/img/f62a5be2f902/ico/stars/v1/stars_small_4.png','url':'http://www.yelp.com/biz/tadich-grill-san-francisco?utm_campaign=yelp_api&utm_medium=api_v2_search&utm_source=-0OmC9HI7oxDSZtNxu8sCQ','categories':[['Seafood','seafood'],['American (Traditional)','tradamerican']],'menu_date_updated':1441956646,'phone':'4153911849','snippet_text':'LOVED!! Had wanted to come here forever, came on a whim when nowhere else appealed to anyone in the party....I basically ate the loaf of sourdough (this is...','image_url':'http://s3-media2.fl.yelpcdn.com/bphoto/MTcEV48NkFJn2sq97946UA/ms.jpg','snippet_image_url':'http://s3-media4.fl.yelpcdn.com/photo/HoNru8Dm1Xy0ugVc2MoAUw/ms.jpg','display_phone':'+1-415-391-1849','rating_img_url_large':'http://s3-media2.fl.yelpcdn.com/assets/2/www/img/ccf2b76faa2c/ico/stars/v1/stars_large_4.png','menu_provider':'single_platform','id':'tadich-grill-san-francisco','is_closed':false,'location':{'cross_streets':'Front St & Battery St','city':'San Francisco','display_address':['240 California St','Financial District','San Francisco, CA 94111'],'geo_accuracy':8,'neighborhoods':['Financial District'],'postal_code':'94111','country_code':'US','address':['240 California St'],'coordinate':{'latitude':37.79356,'longitude':-122.39948},'state_code':'CA'}},'foursquare':{'id':'49f67c43f964a520486c1fe3','name':'Tadich Grill','contact':{'phone':'4153911849','formattedPhone':'(415) 391-1849'},'location':{'address':'240 California St','crossStreet':'btwn Battery St & Front St','lat':37.79335077745009,'lng':-122.39941120147705,'distance':9,'postalCode':'94111','cc':'US','city':'San Francisco','state':'CA','country':'Estados Unidos','formattedAddress':['240 California St (btwn Battery St & Front St)','San Francisco, CA 94111','Estados Unidos']},'categories':[{'id':'4bf58dd8d48988d1ce941735','name':'Marisquería','pluralName':'Marisquerías','shortName':'Mariscos','icon':{'prefix':'https://ss3.4sqi.net/img/categories_v2/food/seafood_','suffix':'.png'},'primary':true}],'verified':true,'stats':{'checkinsCount':6808,'usersCount':5318,'tipCount':114},'url':'http://www.tadichgrill.com','hasMenu':true,'menu':{'type':'Menu','label':'Menú','anchor':'Ver menú','url':'https://foursquare.com/v/tadich-grill/49f67c43f964a520486c1fe3/menu','mobileUrl':'https://foursquare.com/v/49f67c43f964a520486c1fe3/device_menu'},'allowMenuUrlEdit':true,'specials':{'count':0,'items':[]},'venuePage':{'id':'90899255'},'hereNow':{'count':0,'summary':'Nadie aquí','groups':[]},'referralId':'v-1451886558','venueChains':[]}}}}}});
        vm.allLocations = vm.$storage.allLocations;
    }
})();
