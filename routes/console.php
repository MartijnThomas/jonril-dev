<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('telescope:prune --hours=48')->daily();

Schedule::command('backup:clean')->daily()->at('05:45')->timezone('Europe/Amsterdam');
Schedule::command('backup:run')->daily()->at('06:00')->timezone('Europe/Amsterdam');
