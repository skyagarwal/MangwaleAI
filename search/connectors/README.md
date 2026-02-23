# Kafka Connect / Debezium

Deploy a Debezium MySQL connector to stream CDC events from MySQL into Redpanda topics.

Example connector payload (POST to http://localhost:8083/connectors):

{
  "name": "mysql-debezium",
  "config": {
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    "tasks.max": "1",
    "database.hostname": "mysql",
    "database.port": "3306",
    "database.user": "root",
    "database.password": "secret",
    "database.server.id": "5400",
    "topic.prefix": "mangwale",
    "schema.history.internal.kafka.bootstrap.servers": "redpanda:9092",
    "schema.history.internal.kafka.topic": "schema-changes.mangwale",
    "database.include.list": "mangwale",
    "include.schema.changes": "false",
    "tombstones.on.delete": "false",
    "snapshot.mode": "initial"
  }
}
