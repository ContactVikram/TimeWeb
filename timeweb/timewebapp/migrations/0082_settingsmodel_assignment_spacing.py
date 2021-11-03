# Generated by Django 3.2.7 on 2021-11-03 19:21

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('timewebapp', '0081_timewebmodel_has_alerted_due_date_passed_notice'),
    ]

    operations = [
        migrations.AddField(
            model_name='settingsmodel',
            name='assignment_spacing',
            field=models.CharField(choices=[('Comfy', 'Comfy'), ('Compact', 'Compact')], default='Comfy', max_length=7, verbose_name='Assignment Spacing'),
        ),
    ]
