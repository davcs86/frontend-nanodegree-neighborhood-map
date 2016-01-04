(function () {
    $(window).load(function(){
        setTimeout( hideLoader , 100)
    });
    /**
     * Hide the preloader when window loads
     */
    function hideLoader() {
        $('#loader-container').fadeOut('slow')
    }
})();
