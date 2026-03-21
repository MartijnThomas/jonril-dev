<?php

return [
    'outbound' => [
        /*
        |--------------------------------------------------------------------------
        | Outbound Dispatch Policy
        |--------------------------------------------------------------------------
        |
        | immediate: dispatch create/update/delete sync jobs right after note reindex
        | scheduled: only queue intents; scheduler/command dispatches pending jobs
        |
        */
        'dispatch' => env('TIMEBLOCKS_OUTBOUND_DISPATCH', 'immediate'),
    ],
];
