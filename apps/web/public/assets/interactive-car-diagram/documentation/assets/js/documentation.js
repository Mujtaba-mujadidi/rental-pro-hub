(function ($) {

	'use strict';
	
	/* =======================================================
	HEADER NAV
	======================================================= */

	$('.scroll-move').click(function () {
		$('html, body').animate({
			scrollTop: $($(this).attr('href')).offset().top - 120
		}, 500);
		return false;
	});

	var addClassOnScroll = function () {
		var windowTop = $(window).scrollTop();
		$('section[id]').each(function (index, elem) {
			var offsetTop = $(elem).offset().top;
			var outerHeight = $(this).outerHeight(true);
			if (windowTop > (offsetTop - 140) && windowTop < (offsetTop + outerHeight)) {
				var elemId = $(elem).attr('id');
				$("header .bottom nav ul li a.active").removeClass('active');
				$("header .bottom nav ul li a[href='#" + elemId + "']").addClass('active');
			}
		});
	};

	$(window).on('scroll', function () {
		addClassOnScroll();
		var sticky = $('header'),
			scroll = $(window).scrollTop();
		if (scroll >= 80) sticky.addClass('sticky');
		else sticky.removeClass('sticky');
	});

	$('header .bottom nav .navbar-toggler').on('click', function () {
		$('header .bottom nav .navbar-toggler .animated-icon').toggleClass('open');
	});

	$('header .bottom nav ul li a').on('click', function () {
		$('header .bottom nav .navbar-collapse').removeClass('show');
		$('header .bottom nav .navbar-toggler .animated-icon').removeClass('open');
	});

}(jQuery));