/* 
This file includes the code for:

Transitioning the opening and closing of assignments
The entire graph logic
All nine graph buttons and inputs
*/
// THIS FILE HAS NOT BEEN FULLY DOCUMENTED
$(function() {
    function format_minutes(total_minutes) {
        const hour = Math.floor(total_minutes / 60),
            minute = Math.ceil(total_minutes % 60);
        if (hour === 0) {
            if (total_minutes && total_minutes < 1) {
                return "<1m";
            }
            return minute + "m";
        } else if (minute === 0) {
            return hour + "h";
        } else {
            return hour + "h " + minute + "m";
        }
    }
    // scale and font_size is the same for every graph
    let scale, // resolution of the graph
        font_size, // font size of the central text in the graph
        width, // Dimensions of each assignment
        height; // Dimensions of each assignment

    function PreventArrowScroll(e) {
        // Prevent arrow keys from scrolling when clicking the up or down arrows in the graph
        var e = e || window.event;
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
        }
    }
    // Cite later
    // https://stackoverflow.com/questions/6427204/date-parsing-in-javascript-is-different-between-safari-and-chrome
    // Date parser for safari
    function parseDate(date) {
        const parsed = Date.parse(date);
        if (!isNaN(parsed)) {
            return parsed;
        }
        return Date.parse(date.replace(/-/g, '/').replace(/[a-z]+/gi, ' '));
    }
    ignore_queue = false;
    $(".assignment").click(function(e) {
        var e = e || window.event;
        // Runs the click function if
        // There is no other assignment being animated (ignored with ignore_queue=true)
        // The background of the assignment was clicked
        // The footer wasn't clicked (to prevent accidental closing)
        if ((ignore_queue || $(document).queue().length === 0) && !["IMG", "BUTTON", "CANVAS", "INPUT"].includes(e.target.tagName) && !$(e.target).hasClass("graph-footer")) {
            // Runs if no assignments are swapping and the element clicked was the assignment background
            let assignment = $(this);
            const graph_container = assignment.find(".graph-container"),
                not_first_click = assignment.data('not_first_click');
            if (graph_container.attr("style") && assignment.hasClass("disable-hover")) {
                // Runs when assignment is clicked while open

                // Animate the graph's margin bottom to close the assignment
                graph_container.animate({
                    marginBottom: -graph_container.height()
                }, 750, "easeOutCubic", function() {
                    // Hide graph when transition ends
                    assignment.css("overflow", "");
                    graph_container.removeAttr("style")
                        // Used in form.js to resolve a promise to transition deleting the assignment
                        .trigger("transitionend");
                });
                // Begin arrow animation
                this.querySelector(".fallingarrowanimation").beginElement();
                // Make assignment overflow hidden 
                assignment.removeClass("disable-hover").css("overflow", "hidden");
                // If no graphs are open, allow arrow scroll
                if ($(".disable-hover").length === 0) {
                    $(document).off("keydown", PreventArrowScroll);
                }
            } else {
                // If the assignment was clicked while it was closing, stop the closing animation and open it
                graph_container.stop();
                assignment.css("overflow", "");
                graph_container.css({
                    "display": "",
                    "margin-bottom": ""
                });
                // Prevents auto scroll if a graph is open
                if ($(".disable-hover").length === 0) {
                    $(document).keydown(PreventArrowScroll);
                }
                // Make graph visible
                graph_container.css("display", "block");
                let graph = this.querySelector('.graph'),
                    fixed_graph = this.querySelector('.fixed-graph');
                // Disable hover
                assignment.addClass("disable-hover");
                // Animate arrow
                this.querySelector(".risingarrowanimation").beginElement();

                // Select the assignment data in dat
                // dat[0] is the settings and "$assignments-container :first child" is the assignments-container-header div, these cancel each other out when indexing
                let selected_assignment = dat[$("#assignments-container").children().index(assignment.parents(".assignment-container"))],
                    // Load in data
                    [file_sel, ad, x, unit, y, works, dif_assign, skew_ratio, ctime, funct_round, min_work_time, nwd, fixed_mode, dynamic_start, remainder_mode] = selected_assignment;
                // Type conversions
                ad = parseDate(ad + " 00:00");
                x = Math.round((parseDate(x + " 00:00") - ad) / 86400000); // Round to account for DST
                ad = new Date(ad);
                y = +y;
                works = works.map(Number);
                // dif assign is already an int
                skew_ratio = +skew_ratio;
                ctime = +ctime;
                funct_round = +funct_round;
                min_work_time = +min_work_time;
                nwd = nwd.map(Number);
                // dynamic start is already an into
                let mods, // Handles not working days, explained later
                    assign_day_of_week = ad.getDay(), // Used with mods
                    skew_ratio_lim, // Top and bottom caps for skew ratio
                    red_line_start_x = fixed_mode ? 0 : dynamic_start, // X-coordinate of the start of the red line
                    red_line_start_y = fixed_mode ? 0 : works[red_line_start_x - dif_assign], // Y-coordinate of the start of the red line
                    len_works = works.length - 1,
                    y_fremainder = (y - red_line_start_y) % funct_round, // funct_round remainder
                    ignore_ends_mwt = ignore_ends && min_work_time, // ignore_ends only works when min_work_time is also enabled
                    len_nwd = nwd.length,
                    set_skew_ratio = false, // Bool to manually set skew ratio on graph
                    min_work_time_funct_round = min_work_time ? Math.ceil(min_work_time / funct_round) * funct_round : funct_round, // LCM of min_work_time and funct_round
                    a, // "a" part of parabola
                    b, // "b" part of parabola
                    cutoff_transition_value, // Handles minimum_work_time, explained later
                    cutoff_to_use_round, // Handles minimum_work_time, explained later
                    return_y_cutoff, // X-coordinate to start returning y
                    return_0_cutoff, // X-coordinate to start returning 0
                    last_mouse_x,
                    last_mouse_y,
                    wCon,
                    hCon,
                    left_adjust_cutoff,
                    up_adjust_cutoff;
                // Due date
                let due_date = new Date(x);
                due_date.setDate(due_date.getDate() + x);
                // Enable draw_point by default, which determines whether to draw the point on the graph
                let draw_point = true;
                // Redraw graph every mousemove when set skew ratio or draw point is enabled
                function mousemove(e) {
                    var e = e || window.event;
                    const offset = $(fixed_graph).offset();
                    // Passes in mouse x and y to draw, explained later
                    draw(e.pageX - offset.left, e.pageY - offset.top);
                }
                // Handles not working days, explained later
                if (len_nwd) {
                    set_mod_days();
                }
                // Sets the upper and lower caps for skew_ratio
                set_skew_ratio_lim();
                if (skew_ratio > skew_ratio_lim) {
                    skew_ratio = skew_ratio_lim;
                } else if (skew_ratio < 2 - skew_ratio_lim) {
                    skew_ratio = 2 - skew_ratio_lim;
                }
                // Whether or not to display the year
                let disyear;
                if (ad.getFullYear() === due_date.getFullYear()) {
                    disyear = '';
                } else {
                    disyear = ', %Y';
                }
                let date_assignment_created = ad;
                date_assignment_created.setDate(date_assignment_created.getDate() + dif_assign);
                // Days between today and date_assignment_created
                let today_minus_dac = Math.round((new Date() - date_assignment_created) / 86400000),
                    // Days between today and the assignment date
                    today_minus_ad = Math.round((new Date() - ad) / 86400000),
                    day = len_works,
                    lw = works[len_works];
                if (today_minus_dac === len_works - 1 && funct(len_works + dif_assign) > lw && lw !== works[-2] && !nwd.includes(new Date().getDay())) {
                    day--;
                }
                // Sets event handlers only on the assignment's first click
                // It may make more sense to skip this entire part for now and focus on the graph logic
                if (!not_first_click) {
                    // Turn off mousemove to ensure there is only one mousemove handler at a time
                    $(graph).off("mousemove").mousemove(mousemove);
                    // Graph resize event handler
                    $(window).resize(resize);
                    // Ajax any button
                    let ajaxTimeout,
                        data = {
                            'csrfmiddlewaretoken': csrf_token,
                            'pk': $(graph).attr("value"),
                        };

                    function SendButtonAjax(key, value) {
                        // Add key and value the data going to be sent
                        // This way, if this function is called multiple times for different keys and values, they are all sent in one ajax rather than many smaller ones
                        data[key] = value;
                        clearTimeout(ajaxTimeout);
                        ajaxTimeout = setTimeout(function() {
                            // Send data along with the assignment's primary key

                            // It is possible for users to send data that won't make any difference, for example they can quickly click fixed_mode twice, yet the ajax will still send
                            // However, I decided to skip this check and still send the ajax
                            // Coding in a check to only send an ajax when the data has changed is tedious, as I have to store the past values of every button to check with the current value
                            // Plus, a pointless ajax of this sort won't happen frequently, and will have a minimal impact on the server's performance
                            $.ajax({
                                type: "POST",
                                data: data,
                                error: error,
                            });
                            // Reset data
                            data = {
                                'csrfmiddlewaretoken': csrf_token,
                                'pk': $(graph).attr("value"),
                            }
                        }, 1000);
                    }
                    let graphtimeout, // set the hold delay to a variable so it can be cleared key if the user lets go of it within 500ms
                        fired = false, // $(document).keydown( fires for every frame a key is held down. This makes it behaves like it fires once
                        graphinterval,
                        whichkey,
                        old_skew_ratio = skew_ratio; // Old skew ratio is the old original value of the skew ratio if the user decides to cancel
                    function ChangeSkewRatio() {
                        // Change skew ratio by +- 0.1 and cap it
                        if (whichkey === "ArrowDown") {
                            const change_day = today_minus_dac === len_works - 1 && funct(len_works + dif_assign) > lw && lw !== works[-2] && !nwd.includes(new Date().getDay());
                            skew_ratio = +(skew_ratio - 0.1).toFixed(1);
                            if (skew_ratio < 2 - skew_ratio_lim) {
                                skew_ratio = skew_ratio_lim;
                            }
                            // Changes the day if the original todo before the skew ratio is added becomes less than the actual work input
                            if (change_day) {
                                pset();
                                if (funct(len_works + dif_assign) <= lw) {
                                    day++;
                                }
                            }
                        } else {
                            const change_day = today_minus_dac === len_works - 1 && funct(len_works + dif_assign) <= lw && lw !== works[-2] && !nwd.includes(new Date().getDay());
                            skew_ratio = +(skew_ratio + 0.1).toFixed(1);
                            if (skew_ratio > skew_ratio_lim) {
                                skew_ratio = 2 - skew_ratio_lim;
                            }
                            // Changes the day if the original todo before the skew ratio is added becomes greater than the actual work input
                            if (change_day) {
                                pset();
                                if (funct(len_works + dif_assign) > lw) {
                                    day--;
                                }
                            }
                        }
                        // Save skew ratio and draw
                        selected_assignment[7] = skew_ratio; // Change this so it is locally saved when the assignment is closed so it is loaded in correctly when reopened
                        old_skew_ratio = skew_ratio;
                        SendButtonAjax('skew_ratio', skew_ratio);
                        draw();
                    }
                    // Up and down arrow event handler
                    $(document).keydown(function(e) {
                        var e = e || window.event;
                        // $(fixed_graph).is(":visible") to make sure it doesnt change when the assignment is closed
                        // !$(document.activeElement).hasClass("skew-ratio-textbox") prevents double dipping
                        if ((e.key === "ArrowUp" || e.key === "ArrowDown") && $(fixed_graph).is(":visible") && !$(document.activeElement).hasClass("skew-ratio-textbox")) {
                            const rect = fixed_graph.getBoundingClientRect();
                            // Makes sure graph is on screen
                            if (rect.bottom - rect.height / 1.5 > 70 && rect.y + rect.height / 1.5 < window.innerHeight && !fired) {
                                // "fired" makes .keydown fire only when a key is pressed, not repeatedly
                                fired = true;
                                // Which key was pressed
                                whichkey = e.key;
                                // Change skew ratio
                                ChangeSkewRatio();
                                // Add delay to change skew ratio internal
                                graphtimeout = setTimeout(function() {
                                    clearInterval(graphinterval);
                                    graphinterval = setInterval(ChangeSkewRatio, 13); // Changes skew ratio
                                }, 500);
                            }
                        }
                    });
                    $(document).keyup(function(e) {
                        var e = e || window.event;
                        if (e.key === whichkey) {
                            // If the keyup was the same key that was just pressed stop change skew ratio
                            fired = false;
                            clearTimeout(graphtimeout);
                            clearInterval(graphinterval);
                        }
                    });

                    //
                    // Nine buttons event listeners
                    //

                    // Enable mousemove and set_skew_ratio when set skew ratio button is clicked
                    let change_day_mouse, change_day_upper;
                    assignment.find(".skew-ratio-button").click(function() {
                        // Determines whether or not to change the day after skew ratio is set
                        change_day_mouse = today_minus_dac === len_works - 1 && lw !== works[-2] && !nwd.includes(new Date().getDay());
                        // Have no idea how this works but it does
                        if (change_day_mouse) {
                            change_day_upper = lw >= funct(len_works + dif_assign);
                        }
                        $(this).html("Hover and click the graph (click this again to cancel)").one("click", cancel_sr);
                        // Turn off mousemove to ensure there is only one mousemove handler at a time
                        $(graph).off("mousemove").mousemove(mousemove);
                        set_skew_ratio = true;
                    });
                    $(graph).click(function(e) {
                        if (set_skew_ratio) {
                            // Runs if (set_skew_ratio && draw_point || set_skew_ratio && !draw_point)
                            set_skew_ratio = false;
                            // stop set skew ratio if canvas is clicked
                            $(this).next().find(".skew-ratio-button").html("Set skew ratio using graph").off("click", cancel_sr);
                            // Save skew ratio
                            selected_assignment[7] = skew_ratio; // Change this so it is locally saved when the assignment is closed so it is loaded in correctly when reopened
                            old_skew_ratio = skew_ratio;
                            if (change_day_mouse) {
                                pset();
                                if (change_day_upper) {
                                    day -= lw < funct(len_works + dif_assign);
                                } else {
                                    day += lw >= funct(len_works + dif_assign);
                                }
                                change_day_mouse = false;
                            }
                            SendButtonAjax('skew_ratio', skew_ratio);
                            // Disable mousemove
                            if (!draw_point) {
                                $(this).off("mousemove");
                            }
                        } else if (draw_point) {
                            // Runs if (!set_skew_ratio && draw_point)
                            // Disable draw point
                            $(this).off("mousemove");
                            draw_point = false;
                            last_mouse_x = -1;
                            draw();
                        } else {
                            // Runs if (!set_skew_ratio && !draw_point)
                            // Enable draw point
                            draw_point = true;
                            // Turn off mousemove to ensure there is only one mousemove handler at a time
                            $(this).off("mousemove").mousemove(mousemove);
                            // Pass in e because $.trigger makes e.pageX undefined
                            mousemove(e);
                        }
                    });
                    // Cancel set skew ratio
                    function cancel_sr() {
                        $(this).html("Set skew ratio using graph");
                        set_skew_ratio = false;
                        skew_ratio = old_skew_ratio;
                        draw();
                        // No need to ajax since skew ratio is the same
                    }
                    // Dynamically update skew ratio from textbox
                    assignment.find(".skew-ratio-textbox").on("keydown paste click keyup", function() { // keydown for normal sr and keyup for delete
                        var e = e || window.event;
                        if (old_skew_ratio === undefined) {
                            // Sets old_skew_ratio
                            old_skew_ratio = skew_ratio;
                        }
                        if ($(this).val()) {
                            // Sets and caps skew ratio
                            // The skew ratio in the code is 1 more than the displayed skew ratio
                            skew_ratio = +$(this).val() + 1;
                            if (skew_ratio > skew_ratio_lim) {
                                skew_ratio = 2 - skew_ratio_lim;
                            } else if (skew_ratio < 2 - skew_ratio_lim) {
                                skew_ratio = skew_ratio_lim;
                            }
                        } else {
                            // Reset skew ratio to old value if blank
                            skew_ratio = old_skew_ratio;
                            old_skew_ratio = undefined;
                        }
                        draw();
                    }).keypress(function(e) {
                        var e = e || window.event;
                        // Saves skew ratio on enter
                        if (e.key === "Enter") {
                            // focusout event
                            this.blur();
                        }
                    }).focusout(function() {
                        $(this).val('');
                        if (old_skew_ratio !== undefined) {
                            // Save skew ratio
                            selected_assignment[7] = skew_ratio; // Change this so it is locally saved when the assignment is closed so it is loaded in correctly when reopened
                            old_skew_ratio = skew_ratio;
                            SendButtonAjax('skew_ratio', skew_ratio);
                        }
                        // Update old skew ratio
                        old_skew_ratio = skew_ratio;
                    });
                    // Remainder mode
                    assignment.find(".remainder-mode-button").click(function() {
                        remainder_mode = !remainder_mode;
                        selected_assignment[14] = remainder_mode; // Change this so it is locally saved when the assignment is closed so it is loaded in correctly when reopened
                        $(this).html($(this).html() === "Switch to Remainder: First" ? "Switch to Remainder: Last" : "Switch to Remainder: First");
                        SendButtonAjax('remainder_mode', remainder_mode);
                        draw();
                    }).html(remainder_mode ? "Switch to Remainder: Last" : "Switch to Remainder: First"); // Initially set html for remainder mode
                    // Fixed/dynamic mode
                    assignment.find(".fixed-mode-button").click(function() {
                        fixed_mode = !fixed_mode;
                        selected_assignment[12] = fixed_mode; // Change this so it is locally saved when the assignment is closed so it is loaded in correctly when reopened
                        $(this).html($(this).html() === "Switch to Fixed mode" ? "Switch to Dynamic mode" : "Switch to Fixed mode");
                        SendButtonAjax('fixed_mode', fixed_mode);
                        if (fixed_mode) {
                            // Set start of red line and pset()
                            red_line_start_x = 0;
                            red_line_start_y = 0;
                            pset();
                            // Day needs to be set in case it was subtracted by one
                            day = len_works;
                            // Subtract day by one if assignment is in progress
                            if (today_minus_dac === len_works - 1 && funct(len_works + dif_assign) > lw && lw !== works[-2] && !nwd.includes(new Date().getDay())) {
                                day--;
                            }
                        } else {
                            red_line_start_x = dynamic_start;
                            red_line_start_y = works[red_line_start_x - dif_assign];
                            day = len_works;
                            // No need to pset()
                            // Caps dynamic start at x, wouldn't make sense for todo to be shown for the day on the due date
                            if (len_works + dif_assign === x) {
                                day--;
                            }
                        }
                        y_fremainder = (y - red_line_start_y) % funct_round;
                        if (len_nwd) {
                            set_mod_days();
                        }
                        draw();
                    }).html(fixed_mode ? "Switch to dynamic mode" : "Switch to fixed mode");
                    assignment.find(".work-input-button, .total-work-input-button").keypress(function(e) {
                        var e = e || window.event;
                        if (e.key === "Enter" && $(this).val() /* Blank inputs are interpreted as 0 */ ) {
                            if (lw >= y) {
                                alert("You have already finished this assignment");
                            } else if (today_minus_dac > -1) {
                                if (nwd.includes((assign_day_of_week + dif_assign + day) % 7)) {
                                    var todo = 0;
                                } else {
                                    var todo = funct(day + dif_assign + 1) - lw;
                                }
                                const rem_work = today_minus_dac === len_works - 1 && funct(len_works + dif_assign) > lw && lw !== works[-2] && !nwd.includes(new Date().getDay()),
                                    total_mode = $(this).hasClass("total-work-input-button");
                                let input_done = $(this).val().trim().toLowerCase();
                                switch (input_done) {
                                    case "fin":
                                        input_done = Math.max(0, funct(day + dif_assign + 1) - lw);
                                        break;
                                    default: {
                                        input_done = input_done - lw * total_mode;
                                        if (isNaN(input_done)) {
                                            return alert("Value is not a number or keyword");
                                        }
                                    }
                                }
                                if (len_works + dif_assign === x - 1 && (!input_done || x - 1 !== today_minus_ad && input_done + lw < y && !rem_work)) {
                                    return alert("Your last work input must complete the assignment");
                                }
                                let total_done = input_done + lw;
                                if (total_done < 0) {
                                    total_done = 0;
                                }
                                if (rem_work) {
                                    works[len_works] = total_done;
                                    len_works -= 1;
                                } else {
                                    works.push(total_done);
                                }
                                lw = total_done;
                                len_works++;
                                if (input_done != todo) {
                                    if (len_works + dif_assign === x) {
                                        dynamic_start = len_works + dif_assign - 1;
                                    } else {
                                        dynamic_start = len_works + dif_assign;
                                    }
                                    selected_assignment[13] = dynamic_start;
                                    SendButtonAjax("dynamic_start", dynamic_start);
                                    if (!fixed_mode) {
                                        red_line_start_x = dynamic_start;
                                        red_line_start_y = works[dynamic_start - dif_assign];
                                        y_fremainder = (y - red_line_start_y) % funct_round;
                                        if (len_nwd) {
                                            set_mod_days();
                                        }
                                        set_skew_ratio_lim();
                                        pset();
                                    }
                                }
                                SendButtonAjax("works", works);
                                $(this).val('');
                                day = len_works;
                                if (today_minus_dac === len_works - 1 && funct(len_works + dif_assign) > lw && lw !== works[-2] && !nwd.includes(new Date().getDay())) {
                                    day--;
                                }
                                draw();
                                if (lw >= y) {
                                    alert("Finish!\nYou have completed this assignment, good job!");
                                }
                            } else {
                                alert("Please wait until this is assigned");
                            }
                        }
                    });
                    assignment.find(".delete-work-input-button").click(function() {
                        if (len_works > 0) {
                            // Change day if assignment is not in progress
                            if (!(today_minus_dac === len_works - 1 && funct(len_works + dif_assign) > lw && lw !== works[-2] && !nwd.includes(new Date().getDay()))) {
                                day--;
                            }
                            works.pop();
                            len_works--;
                            lw = works[len_works];

                            // If the deleted work input cut the dynamic start, run this
                            // Reverses the logic of work inputs in and recursively decreases red_line_start_x
                            if (red_line_start_x > len_works + dif_assign) {
                                // Wrap in function so the outer loop can be broken out of
                                (function() {
                                    // The outer for loop decrements red_line_start_x if the inner for loop didn't break
                                    for (red_line_start_x = red_line_start_x - 2; red_line_start_x > dif_assign - 1; red_line_start_x--) {
                                        red_line_start_y = works[red_line_start_x - dif_assign];
                                        y_fremainder = (y - red_line_start_y) % funct_round;
                                        if (len_nwd) {
                                            set_mod_days();
                                        }
                                        set_skew_ratio_lim();
                                        pset();
                                        // The inner for loop checks if every work input is the same as the red line for all work inputs greater than that red_line_start_x
                                        let next_funct = funct(red_line_start_x),
                                            next_work = works[red_line_start_x - dif_assign];
                                        for (let i = red_line_start_x; i < len_works + dif_assign; i++) {
                                            const this_funct = next_funct,
                                                this_work = next_work;
                                            next_funct = funct(i + 1),
                                                next_work = works[i - dif_assign + 1];
                                            // When a day is found where the work input isn't the same as the red line for that red_line_start_x, increase red_line_start_x back to where this doesnt happen and break
                                            if (next_funct - this_funct !== next_work - this_work) {
                                                red_line_start_x++;
                                                return;
                                            }
                                        }
                                    }
                                    if (red_line_start_x < 0) {
                                        red_line_start_x = 0;
                                    }
                                })();
                                red_line_start_y = works[red_line_start_x - dif_assign];
                                y_fremainder = (y - red_line_start_y) % funct_round;
                                if (len_nwd) {
                                    set_mod_days();
                                }
                                set_skew_ratio_lim();
                                dynamic_start = red_line_start_x;
                                selected_assignment[13] = dynamic_start;
                                SendButtonAjax("dynamic_start", dynamic_start);
                            }
                            SendButtonAjax("works", works);
                            draw();
                        }
                    });
                    assignment.find(".display-button").click(function() {
                        alert("This feature has not yet been implented");
                    }).css("text-decoration", "line-through");
                    assignment.find(".hide-assignment-button").click(function() {
                        alert("This feature has not yet been implented");
                    }).css("text-decoration", "line-through");
                }

                //
                // Graph logic
                //

                /* 
                The red line for all of the assignments follow a parabola
                The first part of the pset() function calculates the a and b values, and the second part handles the minimum work time and return cutoffs
                funct(n) returns the output of an^2 + bn (with no c variable because it is translated to go through the origin)
                set_mod_days() helps integrate not working days into the schedule 
                */
                function pset(x2 = false, y2 = false) {
                    /*
                    The purpose of this function is to calculate these seven variables:
                    a
                    b
                    skew_ratio
                    cutoff_transition_value
                    cutoff_to_use_round
                    return_y_cutoff
                    return_0_cutoff


                    This part calculates a, b, and skew_ratio

                    Three points are defined, one of which is (0,0), to generate a and b variables such that the parabola passes through all three of them
                    This works because there is a parabola that exists that passes through any three chosen points (with different x coordinates)
                    Notice how the parabola passes through the origin, meaning it does not use a c variable
                    If the start of the line is moved and doesn't pass through (0,0) anymore, translate the parabola back to the origin instead of using a c variable
                    Once the a and b variables are calculated, the assignment is retranslated accordingly

                    The second point is (x1,y1), where x1 is the amount of days and y1 is the amount of units

                    If set skew ratio is enabled, the third point is (x2,y2). skew_ratio will also be redefined
                    If set skew ratio is not enabled, the third point is now (1,x1/y1 * skew_ratio)
                    Here, a straight line is connected from (0,0) and (x1,y1) and then the output of f(1) of that straight line is multiplied by the skew ratio to get the y-coordinate of the first point
                    */

                    // Define (x1, y1) and translate both variables to (0,0)
                    let x1 = x - red_line_start_x,
                        y1 = y - red_line_start_y;
                    if (len_nwd) {
                        x1 -= Math.floor(x1 / 7) * len_nwd + mods[x1 % 7]; // Handles not working day, explained later
                    }
                    // If set skew ratio is enabled, make the third point (x2,y2), which was passed as a parameter
                    // x2 !== false is necessary because the user can resize the window for example and call this function while set skew ratio is true but without passing any coordinates
                    if (set_skew_ratio && x2 !== false) {
                        // (x2,y2) are the raw coordinates of the graoh
                        // This converts the raw coordinates to the graph coordinates that match the steps on the x and y axes
                        // -53.7 and -44.5 were used instead of -50 because I experimented those to be the optimal positions of the graph coordinates
                        x2 = (x2 - 53.7) / wCon - red_line_start_x;
                        y2 = (height - y2 - 44.5) / hCon - red_line_start_y;
                        // Handles not working days, explained later
                        if (len_nwd) {
                            const floorx2 = Math.floor(x2);
                            if (nwd.includes((assign_day_of_week + floorx2 + red_line_start_x) % 7)) {
                                x2 = floorx2;
                            }
                            x2 -= Math.floor(x2 / 7) * len_nwd + mods[floorx2 % 7];
                        }
                        // Use !(x2 > 0) instead of (x2 <= 0) because x2 can be NaN from being outside of the graph sometimes. This ensures that NaN passes the below if statement
                        if (!(x2 > 0)) {
                            // If the mouse is outside the graph to the left, make a line with the slope of y1
                            skew_ratio = skew_ratio_lim;
                            a = 0;
                            b = y1;
                            return_y_cutoff = x1 ? 0 : -1;
                            return_0_cutoff = 1;
                            cutoff_transition_value = 0;
                            return;
                        } else if (x2 >= x1) {
                            // If the mouse is outside the graph to the right, connect the points (0,0), (x1-1,0), (x1,y1)
                            // cite later http://stackoverflow.com/questions/717762/how-to-calculate-the-vertex-of-a-parabola-given-three-points
                            a = y1 / x1;
                            b = a * (1 - x1);

                            skew_ratio = 2 - skew_ratio_lim;
                        } else {
                            // Adjusts for remainder mode
                            if (remainder_mode) {
                                y2 -= y_fremainder;
                            }
                            // If the parabola is being set by the graph, connect (0,0), (x1,y1), (x2,y2)
                            // cite later http://stackoverflow.com/questions/717762/how-to-calculate-the-vertex-of-a-parabola-given-three-points
                            a = (x2 * y1 - x1 * y2) / ((x1 - x2) * x1 * x2);
                            b = (y1 - x1 * x1 * a) / x1;

                            // Redefine skew ratio
                            skew_ratio = (a + b) * x1 / y1;
                            // Cap skew ratio
                            if (skew_ratio > skew_ratio_lim) {
                                skew_ratio = skew_ratio_lim;
                            } else if (skew_ratio < 2 - skew_ratio_lim) {
                                skew_ratio = 2 - skew_ratio_lim;
                            } else if (0.975 < skew_ratio && skew_ratio < 1.025) {
                                // Snap skew ratio to linear
                                if (!x1) {
                                    // Zero division
                                    a = 0;
                                    b = y1;
                                    return_y_cutoff = x1 ? 0 : -1;
                                    return_0_cutoff = 1;
                                    cutoff_transition_value = 0;
                                    return;
                                }
                                skew_ratio = 1;
                                a = 0;
                                b = y1 / x1;
                            }
                        }
                    } else {
                        // cite later http://stackoverflow.com/questions/717762/how-to-calculate-the-vertex-of-a-parabola-given-three-points
                        a = y1 * (1 - skew_ratio) / ((x1 - 1) * x1);
                        b = (y1 - x1 * x1 * a) / x1;
                    }
                    if (!Number.isFinite(a)) {
                        // If there was a zero division somewhere, where x2 === 1 or something else happened, make a line with the slope of y1
                        a = 0;
                        b = y1;
                        return_y_cutoff = x1 ? 0 : -1;
                        return_0_cutoff = 1;
                        cutoff_transition_value = 0;
                        return;
                    }
                    if (a <= 0 || b > 0) {
                        var funct_zero = 0;
                    } else {
                        var funct_zero = -b / a;
                    }
                    if (a >= 0) {
                        var funct_y = x1;
                    } else {
                        var funct_y = ((Math.sqrt(b * b + 4 * a * y1) - b) / a / 2).toFixed(10);
                    }
                    if (funct_round < min_work_time) {
                        cutoff_transition_value = 0;
                        if (a) {
                            cutoff_to_use_round = ((min_work_time_funct_round - b) / a / 2).toFixed(10) - 1e-10;
                            if (funct_zero < cutoff_to_use_round && cutoff_to_use_round < funct_y) {
                                let n = Math.floor(cutoff_to_use_round),
                                    prev_output;
                                for (n of [n, ++n]) {
                                    var output = funct(n, false);
                                    if (output > y) {
                                        output = y;
                                    } else if (output < 0) {
                                        output = 0;
                                    }
                                    prev_output = prev_output || output;
                                }
                                if (output - prev_output) {
                                    cutoff_transition_value = min_work_time_funct_round - output + prev_output;
                                }
                            }
                        }
                    }
                    if (ignore_ends_mwt) {
                        var y_value_to_cutoff = y1;
                    } else if (funct_round < min_work_time && (!a && b < min_work_time_funct_round || a && (a > 0) === (funct_y < cutoff_to_use_round))) {
                        var y_value_to_cutoff = y1 - min_work_time_funct_round / 2;
                    } else {
                        var y_value_to_cutoff = y1 - min_work_time_funct_round + funct_round / 2;
                    }
                    if (y_value_to_cutoff > 0 && y > red_line_start_y && (a || b)) {
                        return_y_cutoff = (a ? (Math.sqrt(b * b + 4 * a * y_value_to_cutoff) - b) / a / 2 : y_value_to_cutoff / b).toFixed(10) - 1e-10;
                    } else {
                        return_y_cutoff = 0;
                    }
                    if (return_y_cutoff < 2500) {
                        if (return_y_cutoff < 1) {
                            var output = 0;
                        } else {
                            for (let n = Math.floor(return_y_cutoff); n > 0; n--) {
                                var output = funct(n, false);
                                if (output <= y - min_work_time_funct_round) {
                                    break;
                                }
                                return_y_cutoff--;
                            }
                        }
                        if (ignore_ends_mwt) {
                            const lower = [return_y_cutoff, y - output];

                            let did_loop = false;
                            for (let n = Math.ceil(return_y_cutoff); n < x1; n++) {
                                const pre_output = funct(n, false);
                                if (pre_output >= y) {
                                    break;
                                }
                                did_loop = true;
                                output = pre_output;
                                return_y_cutoff++;
                            }
                            if (did_loop) {
                                const upper = [return_y_cutoff, y - output];
                                return_y_cutoff = [upper, lower][+(min_work_time_funct_round * 2 - lower[1] > upper[1])][0];
                            }
                        }
                    }
                    if (ignore_ends_mwt) {
                        var y_value_to_cutoff = 0;
                    } else if (funct_round < min_work_time && (!a && b < min_work_time_funct_round || a && (a > 0) === (funct_zero < cutoff_to_use_round))) {
                        var y_value_to_cutoff = min_work_time_funct_round / 2;
                    } else {
                        var y_value_to_cutoff = min_work_time_funct_round - funct_round / 2;
                    }
                    if (y_value_to_cutoff < y1 && y > red_line_start_y && (a || b)) {
                        return_0_cutoff = (a ? (Math.sqrt(b * b + 4 * a * y_value_to_cutoff) - b) / a / 2 : y_value_to_cutoff / b).toFixed(10) - 1e-10;
                        // -1e-10 makes this negative
                        if (return_0_cutoff < 0) {
                            return_0_cutoff++;
                        }
                    } else {
                        return_0_cutoff = 1;
                    }
                    if (x1 - return_0_cutoff < 2500) {
                        if (x1 - return_0_cutoff < 1) {
                            var output = 0;
                        } else {
                            for (let n = Math.ceil(return_0_cutoff); n < x1; n++) {
                                var output = funct(n, false);
                                if (output >= min_work_time_funct_round + red_line_start_y) {
                                    break;
                                }
                                return_0_cutoff++;
                            }
                        }
                        if (ignore_ends_mwt) {
                            const upper = [return_0_cutoff, output];

                            let did_loop = false;
                            for (let n = Math.floor(return_0_cutoff); n > 0; n--) {
                                const pre_output = funct(n, false);
                                if (pre_output <= red_line_start_y) {
                                    break;
                                }
                                did_loop = true;
                                var output = pre_output;
                                return_0_cutoff--;
                            }
                            if (did_loop) {
                                const lower = [return_0_cutoff, output];
                                return_0_cutoff = [lower, upper][+(min_work_time_funct_round * 2 - upper[1] > lower[1])][0];
                            }
                        }
                    }
                }

                function funct(n, translate = true) {
                    if (translate) {
                        // Translate x coordinate 
                        n -= red_line_start_x;
                        if (len_nwd) {
                            n -= Math.floor(n / 7) * len_nwd + mods[n % 7];
                        }
                        if (n > return_y_cutoff) {
                            return y;
                        } else if (n < return_0_cutoff) {
                            return red_line_start_y;
                        }
                    }
                    if (funct_round < min_work_time && (!a && b < min_work_time_funct_round || a && (a > 0) === (n < cutoff_to_use_round))) {
                        // Get translated y coordinate
                        var output = min_work_time_funct_round * Math.round(n * (a * n + b) / min_work_time_funct_round);
                        if (a < 0) {
                            output += cutoff_transition_value;
                        } else {
                            output -= cutoff_transition_value;
                        }
                    } else {
                        var output = funct_round * Math.round(n * (a * n + b) / funct_round);
                    }
                    if (remainder_mode && output) {
                        output += y_fremainder;
                    }
                    // Return untranslated y coordinate
                    return output + red_line_start_y;
                }

                function set_mod_days() {
                    mods = [0];
                    let mod_counter = 0;
                    for (let mod_day = 0; mod_day < 6; mod_day++) {
                        if (nwd.includes((assign_day_of_week + red_line_start_x + mod_day) % 7)) {
                            mod_counter++;
                        }
                        mods.push(mod_counter);
                    }
                }

                function set_skew_ratio_lim() {
                    /*
                    skew_ratio = (a + b) * x1 / y1;
                    skew_ratio = funct(1) * x1 / y1;
                    skew_ratio = (y1+min_work_time_funct_round) * x1 / y1;
                    */
                    const y1 = y - red_line_start_y;
                    if (y1) {
                        let x1 = x - red_line_start_x;
                        if (len_nwd) {
                            x1 -= Math.floor(x1 / 7) * len_nwd + mods[x1 % 7];
                        }
                        skew_ratio_lim = (y1 + min_work_time_funct_round) * x1 / y1;
                    } else {
                        skew_ratio_lim = 0;
                    }
                }
                //
                // End graph logic
                //

                //
                // Draw graph
                //
                function draw(x2 = false, y2 = false) {
                    const actually_draw_point = draw_point && x2 !== false;
                    if (actually_draw_point) {
                        // Cant pass in mouse_x and mouse_y as x2 and y2 because mouse_y becomes a bool
                        // -53.7 and -44.5 were used instead of -50 because I experimented those to be the optimal positions of the graph coordinates
                        var mouse_x = Math.round((x2 - 53.7) / wCon),
                            mouse_y = (height - y2 - 44.5) / hCon;
                        if (mouse_x < Math.min(red_line_start_x, dif_assign)) {
                            mouse_x = Math.min(red_line_start_x, dif_assign);
                        } else if (mouse_x > x) {
                            mouse_x = x;
                        }
                        if (dif_assign <= mouse_x && mouse_x <= len_works + dif_assign) {
                            if (mouse_x < red_line_start_x) {
                                mouse_y = true;
                            } else {
                                mouse_y = Math.abs(mouse_y - funct(mouse_x)) > Math.abs(mouse_y - works[mouse_x - dif_assign]);
                            }
                        } else {
                            mouse_y = false;
                        }
                        if (!set_skew_ratio && last_mouse_x === mouse_x && last_mouse_y === mouse_y) {
                            return;
                        }
                        last_mouse_x = mouse_x; last_mouse_y = mouse_y;
                    }
                    console.log(x2, y2);
                    pset(x2, y2);

                    const screen = graph.getContext("2d");
                    screen.scale(scale, scale);
                    screen.clearRect(0, 0, width, height);
                    let move_info_down,
                        todo = funct(day+dif_assign+1);
                    if (show_progress_bar) {
                        move_info_down = 0;
                        let should_be_done_x = width - 155 + todo / y * 146,
                            bar_move_left = should_be_done_x - width + 17;
                        if (bar_move_left < 0 || x <= today_minus_ad || lw >= y) {
                            bar_move_left = 0
                        } else if (should_be_done_x > width - 8) {
                            bar_move_left = width - 8;
                        }
                        // bar move left
                        screen.fillStyle = "rgb(55,55,55)";
                        screen.fillRect(width-155-bar_move_left,height-121,148,50);
                        screen.fillStyle = "lime";
                        screen.fillRect(width-153-bar_move_left,height-119,144,46);

                        screen.fillStyle = "rgb(0,128,0)";
                        const slash_x = width - 142 - bar_move_left;
                        screen.beginPath();
                        screen.moveTo(slash_x,height-119);
                        screen.lineTo(slash_x+15,height-119);
                        screen.lineTo(slash_x+52.5,height-73);
                        screen.lineTo(slash_x+37.5,height-73);
                        screen.fill();
                        screen.beginPath();
                        screen.moveTo(slash_x+35,height-119);
                        screen.lineTo(slash_x+50,height-119);
                        screen.lineTo(slash_x+87.5,height-73);
                        screen.lineTo(slash_x+72.5,height-73);
                        screen.fill();
                        screen.beginPath();
                        screen.moveTo(slash_x+70,height-119);
                        screen.lineTo(slash_x+85,height-119);
                        screen.lineTo(slash_x+122.5,height-73);
                        screen.lineTo(slash_x+107.5,height-73);
                        screen.fill();

                        screen.textAlign = "center";
                        screen.fillStyle = "black";
                        screen.font = '13.75px Open Sans';
                        screen.textBaseline = "top";
                        if (x > today_minus_ad && lw < y) {
                            screen.fillText(`Your Progress: ${Math.floor(lw/y*100)}%`, width-81, height-68);
                            const done_x = width-153+lw/y*144-bar_move_left;
                            screen.fillStyle = "white";
                            screen.fillRect(done_x, height-119, width-9-bar_move_left-done_x, 46);
                            if (should_be_done_x >= width - 153) {
                                screen.fillStyle = "black";
                                if (should_be_done_x > width - 17) {
                                    should_be_done_x = width - 17;
                                }
                                screen.rotate(Math.PI / 2);
                                // Since rotate, swap x and y, make x negative
                                screen.fillText("Goal", height-95, -should_be_done_x-14);
                                screen.rotate(-Math.PI / 2);
                                screen.fillStyle = "rgb(55,55,55)";
                                screen.fillRect(should_be_done_x, height-119, 2, 46);
                            }
                        } else {
                            screen.fillText("Completed!", width-81-bar_move_left, height-68);
                        }
                    } else {
                        move_info_down = 72;
                    }
                    let radius = wCon / 3;
                    if (radius > 3) {
                        radius = 3;
                    } else if (radius < 2) {
                        radius = 2;
                    }
                    let circle_x,
                        circle_y,
                        line_end = x + Math.ceil(1 / wCon);
                    screen.strokeStyle = "rgb(233,68,46)"; // red
                    screen.lineWidth = radius;
                    screen.beginPath();
                    for (let point = red_line_start_x; point < line_end; point += Math.ceil(1 / wCon)) {
                        circle_x = point * wCon + 50;
                        if (circle_x > width - 5) {
                            circle_x = width - 5;
                        }
                        circle_y = height - funct(point) * hCon - 50;
                        screen.lineTo(circle_x - (point === red_line_start_x) * radius / 2, circle_y); // (point===0)*radius/2 makes sure the first point is filled in properly
                        screen.arc(circle_x, circle_y, radius, 0, 2 * Math.PI);
                        screen.moveTo(circle_x, circle_y);
                    }
                    screen.stroke();
                    screen.beginPath();
                    radius *= 0.75;
                    if (len_works + Math.ceil(1 / wCon) < line_end) {
                        line_end = len_works + Math.ceil(1 / wCon);
                    }
                    screen.strokeStyle = "rgb(1,147,255)"; // blue
                    screen.lineWidth = radius;
                    for (let point = 0; point < line_end; point += Math.ceil(1 / wCon)) {
                        circle_x = (point + dif_assign) * wCon + 50;
                        if (point > len_works) {
                            circle_y = height - works[len_works] * hCon - 50;
                        } else {
                            circle_y = height - works[point] * hCon - 50;
                        }
                        screen.lineTo(circle_x - (point === 0) * radius / 2, circle_y);
                        screen.arc(circle_x, circle_y, radius, 0, 2 * Math.PI);
                        screen.moveTo(circle_x, circle_y);
                    }
                    radius /= 0.75;
                    screen.stroke();
                    screen.textBaseline = "top";
                    screen.textAlign = "start";
                    screen.font = font_size + 'px Open Sans';
                    if (actually_draw_point) {
                        let funct_mouse_x;
                        if (mouse_y) {
                            funct_mouse_x = works[mouse_x - dif_assign];
                        } else {
                            funct_mouse_x = funct(mouse_x).toFixed(6).replace(/\.?0*$/, '');
                        }
                        let str_mouse_x = new Date(ad);
                        str_mouse_x.setDate(str_mouse_x.getDate() + mouse_x);
                        if (disyear) {
                            str_mouse_x = `${('0' + (str_mouse_x.getMonth() + 1)).slice(-2)}/${('0' + str_mouse_x.getDate()).slice(-2)}/${str_mouse_x.getFullYear()}`;
                        } else {
                            str_mouse_x = `${('0' + (str_mouse_x.getMonth() + 1)).slice(-2)}/${('0' + str_mouse_x.getDate()).slice(-2)}`;
                        }
                        if (mouse_x > left_adjust_cutoff) {
                            screen.textAlign = "end";
                        }
                        if (funct_mouse_x < up_adjust_cutoff) {
                            screen.textBaseline = "bottom";
                        }
                        screen.fillStyle = "black";
                        screen.fillText(` (Day: ${str_mouse_x}, ${pluralize(unit,1)}: ${funct_mouse_x}) `, wCon * mouse_x + 50, height - funct_mouse_x * hCon - 50);
                        screen.fillStyle = "lime";
                        screen.strokeStyle = "lime";
                        screen.beginPath();
                        screen.arc(wCon * mouse_x + 50, height - funct_mouse_x * hCon - 50, radius, 0, 2 * Math.PI);
                        screen.stroke();
                        screen.fill();
                        screen.fillStyle = "black";
                    }
                    const rounded_skew_ratio = Math.round(1000*(skew_ratio-1))/1000;
                    screen.textAlign = "end";
                    screen.fillStyle = "black";
                    screen.textBaseline = "top";
                    if (((y - red_line_start_y) / funct_round) % 1) {
                        screen.font = '13.75px Open Sans';
                        screen.fillText(remainder_mode ? "Remainder: First" : "Remainder: Last", width-2, height-155+move_info_down);
                        screen.fillText(fixed_mode ? "Fixed Mode" : "Dynamic Mode", width-2, height-172+move_info_down);
                    } else {
                        screen.fillText(fixed_mode ? "Fixed Mode" : "Dynamic Mode", width-2, height-155+move_info_down);
                    }
                    screen.fillText(`Skew Ratio: ${rounded_skew_ratio} (${rounded_skew_ratio ? "Parabolic" : "Linear"})`, width-2, height-138+move_info_down);
                    // from above: todo = funct(day+dif_assign+1);
                    screen.scale(1 / scale, 1 / scale);
                }

                function drawfixed() {
                    // These only really need to be executed once since this function is run for every assignment but doesnt matter
                    width = $(fixed_graph).width();
                    height = $(fixed_graph).height();
                    if (width > 748) {
                        font_size = 17.1875;
                    } else {
                        font_size = Math.round((width + 450) / 47 * 0.6875);
                    }
                    scale = window.devicePixelRatio;
                    wCon = (width - 55) / x;
                    hCon = (height - 55) / y;

                    graph.width = width * scale;
                    graph.height = height * scale;
                    fixed_graph.width = width * scale;
                    fixed_graph.height = height * scale;
                    let screen = fixed_graph.getContext("2d");
                    screen.scale(scale, scale);
                    const point_text = `(Day: 00/00/0000, ${pluralize(unit,1)}: ${"0".repeat(Math.abs(Math.floor(Math.log10(y)))+1 + Math.abs(Math.floor(Math.log10(funct_round))))})`;
                    screen.font = font_size + 'px Open Sans';
                    const point_text_width = screen.measureText(point_text).width,
                        point_text_height = screen.measureText("0").width * 2;
                    left_adjust_cutoff = (width - 50 - point_text_width) / wCon;
                    up_adjust_cutoff = point_text_height / hCon;

                    // bg gradient
                    let gradient = screen.createLinearGradient(0, 0, 0, height * 4 / 3);
                    gradient.addColorStop(0, "white");
                    gradient.addColorStop(1, "lightgray");
                    screen.fillStyle = gradient;
                    screen.fillRect(0, 0, width, height * 4 / 3);

                    // x and y axis rectangles
                    screen.fillStyle = "rgb(185,185,185)";
                    screen.fillRect(40, 0, 10, height);
                    screen.fillRect(0, height - 50, width, 10);

                    // x axis label
                    screen.fillStyle = "black";
                    screen.textAlign = "center";
                    screen.font = '17.1875px Open Sans';
                    screen.fillText("Days", (width - 50) / 2 + 50, height - 5);

                    // y axis label
                    screen.rotate(Math.PI / 2);
                    if (unit === "Minute") {
                        var text = 'Minutes of Work',
                            label_x_pos = -2;
                    } else {
                        var text = `${pluralize(unit)} (${format_minutes(ctime)} per ${pluralize(unit,1)})`,
                            label_x_pos = -5;
                    }
                    if (screen.measureText(text).width > height - 50) {
                        text = pluralize(unit);
                    }
                    screen.fillText(text, (height - 50) / 2, label_x_pos);
                    screen.rotate(-Math.PI / 2);

                    screen.font = '13.75px Open Sans';
                    screen.textBaseline = "top";
                    const x_axis_scale = Math.pow(10, Math.floor(Math.log10(x))) * Math.ceil(x.toString()[0] / Math.ceil((width - 100) / 100));
                    if (x >= 10) {
                        gradient = screen.createLinearGradient(0, 0, 0, height * 4 / 3);
                        gradient.addColorStop(0, "gainsboro");
                        gradient.addColorStop(1, "silver");
                        const small_x_axis_scale = x_axis_scale / 5,
                            label_index = screen.measureText(Math.floor(x)).width * 1.25 < small_x_axis_scale * wCon;
                        for (let smaller_index = 1; smaller_index <= Math.floor(x / small_x_axis_scale); smaller_index++) {
                            if (smaller_index % 5) {
                                const displayed_number = smaller_index * small_x_axis_scale;
                                screen.fillStyle = gradient; // Line color
                                screen.fillRect(displayed_number * wCon + 48.5, 0, 2, height - 50); // Draws line index
                                screen.fillStyle = "rgb(80,80,80)"; // Number color
                                if (label_index) {
                                    const numberwidth = screen.measureText(displayed_number).width;
                                    let number_x_pos = displayed_number * wCon + 50;
                                    if (number_x_pos + numberwidth / 2 > width - 1) {
                                        number_x_pos = width - numberwidth / 2 - 1;
                                    }
                                    screen.fillText(displayed_number, number_x_pos, height - 39);
                                }
                            }
                        }
                    }

                    screen.textBaseline = "alphabetic";
                    screen.textAlign = "right";
                    const y_axis_scale = Math.pow(10, Math.floor(Math.log10(y))) * Math.ceil(y.toString()[0] / Math.ceil((height - 100) / 100));
                    let font_size5 = 16.90625 - Math.ceil(y - y % y_axis_scale).toString().length * 1.71875;
                    if (y >= 10) {
                        const small_y_axis_scale = y_axis_scale / 5;
                        if (font_size5 < 8.5) {
                            font_size5 = 8.5;
                        }
                        screen.font = font_size5 + 'px Open Sans';
                        const text_height = screen.measureText(0).width * 2,
                            label_index = text_height < small_y_axis_scale * hCon;
                        for (let smaller_index = 1; smaller_index <= Math.floor(y / small_y_axis_scale); smaller_index++) {
                            const displayed_number = smaller_index * small_y_axis_scale;
                            if (smaller_index % 5) {
                                const gradient_percent = 1 - (displayed_number * hCon) / (height - 50);
                                screen.fillStyle = `rgb(${220-16*gradient_percent},${220-16*gradient_percent},${220-16*gradient_percent})`;
                                screen.fillRect(50, height - 51.5 - displayed_number * hCon, width - 50, 2);
                                screen.fillStyle = "rgb(80,80,80)";
                                if (label_index) {
                                    let number_y_pos = height - displayed_number * hCon - 54 + text_height / 2;
                                    if (number_y_pos < 4 + text_height / 2) {
                                        number_y_pos = 4 + text_height / 2;
                                    }
                                    if (38.5 - screen.measureText(displayed_number).width < 13 - label_x_pos) {
                                        screen.textAlign = "left";
                                        screen.fillText(displayed_number, 13 - label_x_pos, number_y_pos);
                                        screen.textAlign = "right";
                                    } else {
                                        screen.fillText(displayed_number, 38.5, number_y_pos);
                                    }
                                }
                            }
                        }
                    }
                    font_size5 *= 1.2;
                    screen.font = font_size5 + 'px Open Sans';
                    const text_height = screen.measureText(0).width * 2;
                    for (let bigger_index = Math.ceil(y - y % y_axis_scale); bigger_index > 0; bigger_index -= y_axis_scale) {
                        if (bigger_index * 2 < y_axis_scale) {
                            break;
                        }
                        screen.fillStyle = "rgb(205,205,205)";
                        screen.fillRect(50, height - bigger_index * hCon - 52.5, width - 50, 5);
                        screen.fillStyle = "black";
                        let number_y_pos = height - bigger_index * hCon - 54 + text_height / 2;
                        if (number_y_pos < 4 + text_height / 2) {
                            number_y_pos = 4 + text_height / 2;
                        }
                        if (38.5 - screen.measureText(bigger_index).width < 13 - label_x_pos) {
                            screen.textAlign = "left";
                            screen.fillText(bigger_index, 13 - label_x_pos, number_y_pos);
                            screen.textAlign = "right";
                        } else {
                            screen.fillText(bigger_index, 38.5, number_y_pos);
                        }
                    }
                    screen.fillText(0, 39, height - 52);

                    screen.textBaseline = "top";
                    screen.textAlign = "center";
                    screen.font = '16.5px Open Sans';
                    for (let bigger_index = Math.ceil(x - x % x_axis_scale); bigger_index > 0; bigger_index -= x_axis_scale) {
                        screen.fillStyle = "rgb(205,205,205)";
                        screen.fillRect(bigger_index * wCon + 47.5, 0, 5, height - 50);
                        screen.fillStyle = "black";
                        const numberwidth = screen.measureText(bigger_index).width;
                        let number_x_pos = bigger_index * wCon + 50;
                        if (number_x_pos + numberwidth / 2 > width - 1) {
                            number_x_pos = width - numberwidth / 2 - 1;
                        }
                        screen.fillText(bigger_index, number_x_pos, height - 39);
                    }
                    screen.fillText(0, 55.5, height - 38.5);
                }

                function resize() {
                    if (assignment.hasClass("disable-hover") && assignment.is(":visible")) {
                        drawfixed();
                        draw();
                    }
                }
                resize();
                //
                // End draw graph
                //
            }
            assignment.data('not_first_click', true);
        }
    });
});