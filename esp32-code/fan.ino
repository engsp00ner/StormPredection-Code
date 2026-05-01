#define FAN_PIN 25

void setup() {
  Serial.begin(115200);
  pinMode(FAN_PIN, OUTPUT);
  digitalWrite(FAN_PIN, HIGH);  // HIGH = fan OFF at startup (active LOW relay)
  Serial.println("Fan test starting...");
}

void loop() {
  Serial.println("Fan ON");
  digitalWrite(FAN_PIN, HIGH);   // LOW = relay closed = fan ON
  delay(10000);

  Serial.println("Fan OFF");
  digitalWrite(FAN_PIN, LOW);  // HIGH = relay open = fan OFF
  delay(5000);
}
