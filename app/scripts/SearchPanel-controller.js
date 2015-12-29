(function () {
    'use strict';
    angular
    .module('NeighborhoodMap')
    .controller('SearchPanelController', SearchPanelController);
    SearchPanelController.$inject = ['$timeout', '$mdSidenav'];
    function SearchPanelController ($timeout, $mdSidenav) {
        var vm = this;
        vm.close = function () {
            $mdSidenav('left').close();
        };
    }
})();
