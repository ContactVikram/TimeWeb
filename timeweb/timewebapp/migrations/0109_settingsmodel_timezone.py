# Generated by Django 3.2.7 on 2021-12-17 11:14

from django.db import migrations
import timezone_field.fields


class Migration(migrations.Migration):

    dependencies = [
        ('timewebapp', '0108_rename_has_alerted_due_date_incremented_notice_timewebmodel_alert_due_date_incremented'),
    ]

    operations = [
        migrations.AddField(
            model_name='settingsmodel',
            name='timezone',
            field=timezone_field.fields.TimeZoneField(blank=True, null=True),
        ),
    ]