<?php

test('health check endpoint is publicly reachable', function (): void {
    $this->get('/healthz')
        ->assertOk()
        ->assertExactJson([
            'status' => 'ok',
        ]);
});
