(function () {
    'use strict';
    angular
    .module('NeighborhoodMap', [
        'ngAnimate',
        'ngAria',
        'ngMessages',
        'ngMaterial'
    ])
    .controller('AppController', AppController);

    AppController.$inject = ['$timeout', '$mdSidenav'];

    function AppController ($timeout, $mdSidenav) {
        var vm = this;
        vm.toggleLeft = buildDelayedToggler('left');
        vm.toggleRight = buildToggler('right');
        vm.isOpenRight = function(){
            return $mdSidenav('right').isOpen();
        };
        /**
         * Supplies a function that will continue to operate until the
         * time is up.
         */
        function debounce(func, wait) {
            var timer;
            return function debounced() {
                var context = vm,
                    args = Array.prototype.slice.call(arguments);
                $timeout.cancel(timer);
                timer = $timeout(function() {
                    timer = undefined;
                    func.apply(context, args);
                }, wait || 10);
            };
        }
        /**
         * Build handler to open/close a SideNav; when animation finishes
         * report completion in console
         */
        function buildDelayedToggler(navID) {
            return debounce(function() {
                $mdSidenav(navID)
                .toggle();
            }, 200);
        }
        function buildToggler(navID) {
            return function() {
                $mdSidenav(navID)
                .toggle();
            }
        }
    }

})();
