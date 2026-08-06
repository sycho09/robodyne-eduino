/*
 * playhouse-uno.c — Playino · PlayHouse 펌웨어 (베어메탈 빌드 소스)
 *
 * 이 파일은 public/firmware/playhouse-uno.hex 를 생성하기 위한 ATmega328P
 * 베어메탈 구현이다. 와이어 동작(프로토콜)은 부록 A 의 Arduino 스케치
 * (playhouse-firmware.ino)와 완전히 동일하다. Arduino 코어 없이도
 * 오프라인 컴파일이 가능하도록 레지스터를 직접 다룬다.
 *
 *   H->B : PING / L<pin>:<0|1> / P<pin>:<0-255> / T<pin>:<freq>[,<ms>] / A<ch> / R<pin> / U<trig>:<echo> / DHT
 *          N<pin>:<idx>,<r>,<g>,<b> (네오픽셀 1픽셀) / NA<pin>:<r>,<g>,<b> (전체 채우기) / NS<pin> (반영)
 *   B->H : READY (부팅) / PLAYHOUSE v5 (PING 응답) / OK / ERR:<msg>
 *          A<ch>:<0-1023> (아날로그) / R<pin>:<0|1> (디지털) / US:<cm> (초음파) / DHT:<t>,<h>
 *
 * 빌드:
 *   avr-gcc -mmcu=atmega328p -DF_CPU=16000000UL -Os -o fw.elf playhouse-uno.c
 *   avr-objcopy -O ihex -R .eeprom fw.elf playhouse-uno.hex
 */

#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#include <stdlib.h>
#include <string.h>

#define FW_ID "PLAYHOUSE v5"
#define DHT_BIT 2   /* DHT-11 DATA = D2 (PD2) */

/* ---- UART (115200 @ 16MHz, U2X) ---- */
static void uart_init(void) {
    UBRR0H = 0;
    UBRR0L = 16;                       /* 16MHz/(8*(16+1)) = 117647 ~ +2.1% */
    UCSR0A = (1 << U2X0);
    UCSR0B = (1 << RXEN0) | (1 << TXEN0);
    UCSR0C = (1 << UCSZ01) | (1 << UCSZ00); /* 8N1 */
}
static void uart_tx(char c) {
    while (!(UCSR0A & (1 << UDRE0))) {}
    UDR0 = c;
}
static void uart_print(const char *s) { while (*s) uart_tx(*s++); }
static void uart_println(const char *s) { uart_print(s); uart_tx('\n'); }
static char uart_rx(void) {
    while (!(UCSR0A & (1 << RXC0))) {}
    return UDR0;
}

/* ---- PWM 타이머 초기화 (analogWrite 용, 핀 3/5/6/9/10/11) ---- */
static void pwm_init(void) {
    TCCR0A = (1 << WGM01) | (1 << WGM00);            /* Fast PWM */
    TCCR0B = (1 << CS01);                            /* presc 8 */
    TCCR1A = (1 << WGM10);                           /* 8-bit Fast PWM */
    TCCR1B = (1 << WGM12) | (1 << CS11);             /* presc 8 */
    TCCR2A = (1 << WGM21) | (1 << WGM20);            /* Fast PWM */
    TCCR2B = (1 << CS22);                            /* presc 64 */
}

static void set_output(uint8_t pin) {
    if (pin <= 7)       DDRD |= (1 << pin);
    else if (pin <= 13) DDRB |= (1 << (pin - 8));
}

static void pwm_disconnect(uint8_t pin) {
    switch (pin) {
        case 6:  TCCR0A &= ~(1 << COM0A1); break;
        case 5:  TCCR0A &= ~(1 << COM0B1); break;
        case 9:  TCCR1A &= ~(1 << COM1A1); break;
        case 10: TCCR1A &= ~(1 << COM1B1); break;
        case 11: TCCR2A &= ~(1 << COM2A1); break;
        case 3:  TCCR2A &= ~(1 << COM2B1); break;
        default: break;
    }
}

/* digitalWrite */
static void pin_digital(uint8_t pin, uint8_t v) {
    set_output(pin);
    pwm_disconnect(pin);
    if (pin <= 7) {
        if (v) PORTD |= (1 << pin); else PORTD &= ~(1 << pin);
    } else if (pin <= 13) {
        uint8_t b = pin - 8;
        if (v) PORTB |= (1 << b); else PORTB &= ~(1 << b);
    }
}

/* analogWrite (HW PWM on timer pins, 그 외는 임계값) */
static void pin_analog(uint8_t pin, uint8_t val) {
    set_output(pin);
    if (val == 0)   { pin_digital(pin, 0); return; }
    if (val == 255) { pin_digital(pin, 1); return; }
    switch (pin) {
        case 6:  TCCR0A |= (1 << COM0A1); OCR0A = val; break;
        case 5:  TCCR0A |= (1 << COM0B1); OCR0B = val; break;
        case 9:  TCCR1A |= (1 << COM1A1); OCR1A = val; break;
        case 10: TCCR1A |= (1 << COM1B1); OCR1B = val; break;
        case 11: TCCR2A |= (1 << COM2A1); OCR2A = val; break;
        case 3:  TCCR2A |= (1 << COM2B1); OCR2B = val; break;
        default: pin_digital(pin, val >= 128 ? 1 : 0); break;
    }
}

/* ---- 가변 마이크로초 지연 (tone 용; _delay_us 는 상수만 허용) ---- */
static void delay_us_var(uint16_t us) { while (us--) _delay_us(1); }

/* ---- tone: pin 을 freq(Hz) 로 ms 동안 구형파 출력 (블로킹, 부저) ---- */
static void tone_pin(uint8_t pin, uint16_t freq, uint16_t ms) {
    if (freq == 0 || ms == 0) return;
    set_output(pin); pwm_disconnect(pin);
    uint16_t half = (uint16_t)(500000UL / freq);          /* 반주기(us) */
    uint32_t cycles = ((uint32_t)freq * ms) / 1000UL;
    for (uint32_t i = 0; i < cycles; i++) {
        if (pin <= 7) PORTD |= (1 << pin); else PORTB |= (1 << (pin - 8));
        delay_us_var(half);
        if (pin <= 7) PORTD &= ~(1 << pin); else PORTB &= ~(1 << (pin - 8));
        delay_us_var(half);
    }
}

/* ---- ADC (아날로그 입력: A0~A5) ---- */
static void adc_init(void) {
    ADMUX = (1 << REFS0);                                  /* AVcc 기준 */
    ADCSRA = (1 << ADEN) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADPS0); /* presc 128 */
}
static uint16_t adc_read(uint8_t ch) {
    ADMUX = (1 << REFS0) | (ch & 0x07);
    ADCSRA |= (1 << ADSC);
    while (ADCSRA & (1 << ADSC)) {}
    return ADC;
}

/* ---- 디지털 입력 읽기 (소리/불꽃/버튼 등) ---- */
static uint8_t pin_read(uint8_t pin) {
    if (pin <= 7) { DDRD &= ~(1 << pin); return (PIND >> pin) & 1; }
    uint8_t b = pin - 8; DDRB &= ~(1 << b); return (PINB >> b) & 1;
}

/* ---- 핀 레벨 읽기(빠른 in-loop 용; DDR 변경 없음) ---- */
static uint8_t pin_level(uint8_t pin) {
    if (pin <= 7) return (PIND >> pin) & 1;
    return (PINB >> (pin - 8)) & 1;
}

/* ---- 초음파(HC-SR04): Trig 10us 펄스 → Echo HIGH 폭 측정 → 거리(cm) ----
 * 측정 동안만 Timer1 을 normal/presc8(0.5us/tick)로 돌려 폭을 재고 PWM 설정 복구.
 * cm = us/58 = (ticks*0.5)/58 = ticks/116.  에코 없음/범위밖 = -1 */
static long ultrasonic_cm(uint8_t trig, uint8_t echo) {
    /* echo 입력 설정 */
    if (echo <= 7) DDRD &= ~(1 << echo); else DDRB &= ~(1 << (echo - 8));
    /* trig 10us 펄스 */
    pin_digital(trig, 0); _delay_us(2);
    pin_digital(trig, 1); _delay_us(10);
    pin_digital(trig, 0);
    /* Timer1: normal, presc8 → 0.5us/tick (PWM 설정 백업 후 복구) */
    uint8_t a = TCCR1A, b = TCCR1B;
    TCCR1A = 0; TCCR1B = (1 << CS11);
    /* echo 상승 대기 (≈30ms 타임아웃) */
    TCNT1 = 0;
    while (!pin_level(echo)) { if (TCNT1 > 60000) { TCCR1A = a; TCCR1B = b; return -1; } }
    /* echo HIGH 폭 측정 */
    TCNT1 = 0;
    while (pin_level(echo)) { if (TCNT1 > 60000) { TCCR1A = a; TCCR1B = b; return -1; } }
    uint16_t ticks = TCNT1;
    TCCR1A = a; TCCR1B = b;
    long cm = (long)ticks / 116;
    if (cm <= 0 || cm > 400) return -1;
    return cm;
}

/* ---- DHT-11 (1-wire, D2) ---- */
static void uart_print_u8(uint8_t v) { char b[5]; itoa(v, b, 10); uart_print(b); }
static void uart_print_u16(uint16_t v) { char b[7]; itoa(v, b, 10); uart_print(b); }

/* pin 이 level(0 또는 (1<<DHT_BIT)) 인 동안의 루프 카운트. 0=타임아웃 */
static uint16_t dht_pulse(uint8_t level) {
    uint16_t c = 0;
    while ((PIND & (1 << DHT_BIT)) == level) { if (++c >= 12000) return 0; }
    return c;
}
/* 성공 시 1, temp/hum 채움 */
static uint8_t dht_read(uint8_t *temp, uint8_t *hum) {
    uint8_t data[5] = { 0, 0, 0, 0, 0 };
    /* 시작 신호: 최소 18ms LOW */
    DDRD |= (1 << DHT_BIT);
    PORTD &= ~(1 << DHT_BIT);
    _delay_ms(20);
    PORTD |= (1 << DHT_BIT);
    _delay_us(40);
    DDRD &= ~(1 << DHT_BIT);          /* 입력 */
    PORTD |= (1 << DHT_BIT);          /* 풀업 */
    _delay_us(10);
    /* 응답: ~80us LOW, ~80us HIGH */
    if (dht_pulse(0) == 0) return 0;
    if (dht_pulse(1 << DHT_BIT) == 0) return 0;
    /* 40비트: 각 비트 = LOW(50us) + HIGH(26us=0 / 70us=1) */
    for (uint8_t i = 0; i < 40; i++) {
        uint16_t low = dht_pulse(0);
        uint16_t high = dht_pulse(1 << DHT_BIT);
        if (low == 0 || high == 0) return 0;
        data[i / 8] <<= 1;
        if (high > low) data[i / 8] |= 1;
    }
    if ((uint8_t)(data[0] + data[1] + data[2] + data[3]) != data[4]) return 0;
    *hum = data[0];
    *temp = data[2];
    return 1;
}

/* ---- NeoPixel (WS2812, D6=PD6) ----
 * 단일 데이터선 비트뱅잉(cpldcpu light_ws2812 방식). 16MHz 기준 사이클 타이밍.
 * WS2812 전송 순서는 G,R,B. 호스트는 N/NA 로 버퍼를 채우고 NS 로 반영(show)한다. */
#define NEO_PIN 6           /* D6 = PD6 (HARDWARE.md 기준) */
#define NEO_MAX 8           /* 스트립 최대 픽셀 수(실제가 적으면 앞쪽만 점등) */
static uint8_t neo_buf[NEO_MAX * 3];   /* 픽셀별 G,R,B (전송 순서 그대로 저장) */

/* WS2812 비트뱅잉 — PORTD 고정, maskhi/masklo 는 PD6 만 토글한 포트값 */
#define w_zeropulse   350
#define w_onepulse    900
#define w_totalperiod 1250
#define w_fixedlow    2
#define w_fixedhigh   4
#define w_fixedtotal  8
#define w_zerocycles  (((F_CPU/1000)*w_zeropulse           )/1000000)
#define w_onecycles   (((F_CPU/1000)*w_onepulse    + 500000)/1000000)
#define w_totalcycles (((F_CPU/1000)*w_totalperiod + 500000)/1000000)
#define w1 (w_zerocycles-w_fixedlow)
#define w2 (w_onecycles-w_fixedhigh-w1)
#define w3 (w_totalcycles-w_fixedtotal-w1-w2)
#define w1_nops w1
#define w2_nops w2
#define w3_nops w3
#define w_nop1  "nop      \n\t"
#define w_nop2  "rjmp .+0 \n\t"
#define w_nop4  w_nop2 w_nop2
#define w_nop8  w_nop4 w_nop4
#define w_nop16 w_nop8 w_nop8

static void ws2812_send(uint8_t *data, uint16_t datlen, uint8_t maskhi, uint8_t masklo) {
    uint8_t curbyte, ctr, sreg_prev;
    sreg_prev = SREG;
    cli();
    while (datlen--) {
        curbyte = *data++;
        asm volatile(
        "       ldi   %0,8  \n\t"
        "loop%=:out   %2,%3 \n\t"
#if (w1_nops & 1)
        w_nop1
#endif
#if (w1_nops & 2)
        w_nop2
#endif
#if (w1_nops & 4)
        w_nop4
#endif
#if (w1_nops & 8)
        w_nop8
#endif
        "       sbrs  %1,7  \n\t"
        "       out   %2,%4 \n\t"
        "       lsl   %1    \n\t"
#if (w2_nops & 1)
        w_nop1
#endif
#if (w2_nops & 2)
        w_nop2
#endif
#if (w2_nops & 4)
        w_nop4
#endif
#if (w2_nops & 8)
        w_nop8
#endif
        "       out   %2,%4 \n\t"
#if (w3_nops & 1)
        w_nop1
#endif
#if (w3_nops & 2)
        w_nop2
#endif
#if (w3_nops & 4)
        w_nop4
#endif
#if (w3_nops & 8)
        w_nop8
#endif
        "       dec   %0    \n\t"
        "       brne  loop%=\n\t"
        : "=&d"(ctr)
        : "r"(curbyte), "I"(_SFR_IO_ADDR(PORTD)), "r"(maskhi), "r"(masklo)
        );
    }
    SREG = sreg_prev;
}

static void neo_set(uint8_t idx, uint8_t r, uint8_t g, uint8_t b) {
    if (idx >= NEO_MAX) return;
    neo_buf[idx * 3 + 0] = g; neo_buf[idx * 3 + 1] = r; neo_buf[idx * 3 + 2] = b;
}
static void neo_fill(uint8_t r, uint8_t g, uint8_t b) {
    for (uint8_t i = 0; i < NEO_MAX; i++) { neo_buf[i * 3] = g; neo_buf[i * 3 + 1] = r; neo_buf[i * 3 + 2] = b; }
}
static void neo_show(void) {
    set_output(NEO_PIN); pwm_disconnect(NEO_PIN);
    uint8_t pinmask = (1 << NEO_PIN);
    uint8_t hi = PORTD | pinmask, lo = PORTD & ~pinmask;
    ws2812_send(neo_buf, NEO_MAX * 3, hi, lo);
    _delay_us(80);          /* 래치(>50us LOW) */
}

static void handle(char *line) {
    if (strcmp(line, "PING") == 0) { uart_println(FW_ID); return; }
    if (strcmp(line, "DHT") == 0) {
        uint8_t t, h;
        if (dht_read(&t, &h)) {
            uart_print("DHT:"); uart_print_u8(t); uart_tx(','); uart_print_u8(h); uart_tx('\n');
        } else {
            uart_println("ERR:dht");
        }
        return;
    }

    /* NeoPixel: NS<pin>=show / NA<pin>:<r>,<g>,<b>=전체채우기+show / N<pin>:<idx>,<r>,<g>,<b>=1픽셀 */
    if (line[0] == 'N') {
        if (line[1] == 'S') { neo_show(); uart_println("OK"); return; }
        char *c = strchr(line, ':');
        if (!c) { uart_println("ERR:format"); return; }
        if (line[1] == 'A') {
            char *c1 = strchr(c + 1, ','), *c2 = c1 ? strchr(c1 + 1, ',') : 0;
            if (!c1 || !c2) { uart_println("ERR:format"); return; }
            neo_fill((uint8_t)atoi(c + 1), (uint8_t)atoi(c1 + 1), (uint8_t)atoi(c2 + 1));
            neo_show(); uart_println("OK"); return;
        }
        char *c1 = strchr(c + 1, ','), *c2 = c1 ? strchr(c1 + 1, ',') : 0, *c3 = c2 ? strchr(c2 + 1, ',') : 0;
        if (!c1 || !c2 || !c3) { uart_println("ERR:format"); return; }
        neo_set((uint8_t)atoi(c + 1), (uint8_t)atoi(c1 + 1), (uint8_t)atoi(c2 + 1), (uint8_t)atoi(c3 + 1));
        uart_println("OK"); return;
    }

    char type = line[0];

    /* 콜론 없는 읽기 명령: A<ch>=아날로그, R<pin>=디지털 */
    if (type == 'A' && !strchr(line, ':')) {
        int ch = atoi(line + 1); if (ch < 0 || ch > 7) { uart_println("ERR:ch"); return; }
        uint16_t v = adc_read((uint8_t)ch);
        uart_tx('A'); uart_print_u8((uint8_t)ch); uart_tx(':'); uart_print_u16(v); uart_tx('\n'); return;
    }
    if (type == 'R' && !strchr(line, ':')) {
        int pin = atoi(line + 1); if (pin < 0 || pin > 13) { uart_println("ERR:pin"); return; }
        uint8_t v = pin_read((uint8_t)pin);
        uart_tx('R'); uart_print_u8((uint8_t)pin); uart_tx(':'); uart_print_u8(v); uart_tx('\n'); return;
    }

    char *colon = strchr(line, ':');
    if (!colon) { uart_println("ERR:format"); return; }

    int pin = atoi(line + 1);          /* atoi 는 ':' 앞 숫자까지만 파싱 */
    int val = atoi(colon + 1);

    if (pin < 0 || pin > 13) { uart_println("ERR:pin"); return; }

    if (type == 'L')      { pin_digital(pin, val ? 1 : 0); uart_println("OK"); }
    else if (type == 'P') {
        if (val < 0) val = 0;
        if (val > 255) val = 255;
        pin_analog(pin, (uint8_t)val); uart_println("OK");
    }
    else if (type == 'T') {            /* tone: T<pin>:<freq>[,<ms>] */
        char *comma = strchr(colon + 1, ',');
        int ms = comma ? atoi(comma + 1) : 200;
        if (val < 0) val = 0; if (ms < 0) ms = 0; if (ms > 2000) ms = 2000;
        tone_pin((uint8_t)pin, (uint16_t)val, (uint16_t)ms); uart_println("OK");
    }
    else if (type == 'U') {            /* 초음파: U<trig>:<echo> → US:<cm> */
        if (val < 0 || val > 13) { uart_println("ERR:pin"); return; }
        long cm = ultrasonic_cm((uint8_t)pin, (uint8_t)val);
        char b[8]; itoa((int)cm, b, 10);
        uart_print("US:"); uart_print(b); uart_tx('\n');
    }
    else                  { uart_println("ERR:cmd"); }
}

int main(void) {
    /* D2~D6 출력 (거실=D2 등) — 부록 A 와 동일 */
    for (uint8_t p = 2; p <= 6; p++) set_output(p);

    uart_init();
    pwm_init();
    adc_init();
    uart_println("READY");

    char buf[40];
    uint8_t len = 0;
    for (;;) {
        char c = uart_rx();
        if (c == '\r') continue;
        if (c == '\n') {
            buf[len] = 0;
            /* 앞뒤 공백 trim */
            char *s = buf;
            while (*s == ' ' || *s == '\t') s++;
            uint8_t e = strlen(s);
            while (e > 0 && (s[e-1] == ' ' || s[e-1] == '\t')) s[--e] = 0;
            if (e > 0) handle(s);
            len = 0;
            continue;
        }
        if (len < sizeof(buf) - 1) buf[len++] = c;
    }
}
